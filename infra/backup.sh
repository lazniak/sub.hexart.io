#!/usr/bin/env bash
#
# Nightly Postgres backup for sub.hexart.io.
#
#   ./infra/backup.sh                    # dump, verify, prune to 14 days
#   ./infra/backup.sh --verify-restore   # additionally restore the newest dump
#                                        # into a throwaway database and check it
#   ./infra/backup.sh --list             # what is on disk
#
# ── RESTORE ───────────────────────────────────────────────────────────────────
#
# The dumps carry `--clean --if-exists`, so this command is the whole procedure
# and it works against both an empty and a populated database:
#
#   docker compose --project-directory infra --env-file infra/.env \
#     -f infra/docker-compose.yml stop web relay
#
#   gunzip -c /var/backups/sub-hexart/sub-20260808T020000Z.sql.gz |
#     docker compose --project-directory infra --env-file infra/.env \
#       -f infra/docker-compose.yml exec -T postgres \
#       psql -v ON_ERROR_STOP=1 -U sub -d sub
#
#   docker compose --project-directory infra --env-file infra/.env \
#     -f infra/docker-compose.yml start web relay
#
# That exact pipeline — same dump, same flags, same psql invocation — is what
# --verify-restore runs against a scratch database. It is wired into cron weekly
# (infra/README.md §7), so the restore path is exercised on real backups rather
# than trusted on the strength of the dumps existing.

set -Eeuo pipefail

INFRA_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/.env}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/sub-hexart}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
# A dump smaller than this means pg_dump produced a stub, not a database.
MIN_BYTES="${MIN_BYTES:-4096}"
# node_exporter textfile collector, if it happens to be installed.
METRICS_DIR="${METRICS_DIR:-/var/lib/node_exporter/textfile_collector}"

log() { printf '[backup] %s  %s\n' "$(date -u '+%H:%M:%S')" "$*" >&2; }
die() {
  printf '[backup] %s  FATAL: %s\n' "$(date -u '+%H:%M:%S')" "$*" >&2
  write_metrics 0
  exit 1
}

compose() {
  docker compose --project-directory "$INFRA_DIR" --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" "$@"
}

# Read the credentials from the running container rather than parsing the env
# file. docker's env-file format and shell quoting rules do not agree, and this
# way the script can never disagree with what Postgres actually started with.
pg_env() { compose exec -T postgres printenv "$1" | tr -d '\r\n'; }

# psql/pg_dump run over the container's unix socket, where the official image
# trusts local connections. No password crosses this boundary.
in_pg() { compose exec -T postgres "$@"; }

write_metrics() {
  local ok="$1"
  [ -d "$METRICS_DIR" ] || return 0
  local tmp="$METRICS_DIR/.sub_pg_backup.prom.$$"
  {
    echo '# HELP sub_pg_backup_success Last backup run finished without error.'
    echo '# TYPE sub_pg_backup_success gauge'
    echo "sub_pg_backup_success $ok"
    echo '# HELP sub_pg_backup_timestamp_seconds Unix time of the last backup run.'
    echo '# TYPE sub_pg_backup_timestamp_seconds gauge'
    echo "sub_pg_backup_timestamp_seconds $(date -u +%s)"
  } >"$tmp"
  mv -f "$tmp" "$METRICS_DIR/sub_pg_backup.prom"
}

# ── Dump ──────────────────────────────────────────────────────────────────────

do_dump() {
  local user db stamp target tmp bytes
  user=$(pg_env POSTGRES_USER)
  db=$(pg_env POSTGRES_DB)
  stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  target="$BACKUP_DIR/${db}-${stamp}.sql.gz"
  tmp="$target.partial"

  install -d -m 700 "$BACKUP_DIR"
  log "dumping $db as $user"

  # --clean --if-exists makes the restore idempotent; --no-owner --no-privileges
  # makes it portable to a fresh cluster with a different role name.
  if ! in_pg pg_dump -U "$user" -d "$db" \
    --clean --if-exists --no-owner --no-privileges |
    gzip -9 >"$tmp"; then
    rm -f "$tmp"
    die 'pg_dump failed'
  fi

  gzip -t "$tmp" || {
    rm -f "$tmp"
    die 'dump did not survive its own gzip integrity check'
  }

  bytes=$(stat -c '%s' "$tmp")
  if [ "$bytes" -lt "$MIN_BYTES" ]; then
    rm -f "$tmp"
    die "dump is only ${bytes} bytes — refusing to keep it"
  fi

  # Rename last, so a partial dump is never mistaken for a complete one.
  mv -f "$tmp" "$target"
  chmod 600 "$target"
  (cd "$BACKUP_DIR" && sha256sum "$(basename "$target")" >"$(basename "$target").sha256")
  log "wrote $target (${bytes} bytes)"
  printf '%s\n' "$target"
}

prune_old() {
  log "pruning dumps older than $RETENTION_DAYS days"
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) \
    -mtime "+$RETENTION_DAYS" -print -delete
}

newest_dump() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' |
    sort | tail -n 1
}

# ── Restore rehearsal ─────────────────────────────────────────────────────────

verify_restore() {
  local dump user scratch tables drift
  dump=$(newest_dump)
  [ -n "$dump" ] || die 'no dump to verify'
  user=$(pg_env POSTGRES_USER)
  scratch="restore_check_$(date -u +%s)"

  log "restoring $(basename "$dump") into $scratch"
  in_pg createdb -U "$user" "$scratch" || die "could not create $scratch"

  # Drop the scratch database whatever happens next, including on ^C. Expanded
  # now, not at trap time: `user` and `scratch` are locals and will be gone by
  # the time EXIT fires.
  trap "in_pg dropdb -U '$user' --if-exists --force '$scratch' >/dev/null 2>&1 || true" EXIT

  gunzip -c "$dump" |
    in_pg psql -v ON_ERROR_STOP=1 -q -U "$user" -d "$scratch" >/dev/null ||
    die 'restore failed — this backup is not usable'

  tables=$(in_pg psql -Aqt -U "$user" -d "$scratch" \
    -c "select count(*) from information_schema.tables where table_schema = 'public'" |
    tr -d '[:space:]')
  [ "${tables:-0}" -gt 0 ] || die 'restored database has no tables'

  # The accounting invariant from ARCHITECTURE.md §3.4: credit_balances is a
  # materialised view of an append-only ledger. If the restored copy disagrees
  # with SUM(delta), either the backup is torn or production is already wrong.
  drift=$(in_pg psql -Aqt -U "$user" -d "$scratch" -c "
    select count(*) from (
      select l.user_id
      from credit_ledger l
      group by l.user_id
      having abs(
        sum(l.delta) - coalesce(
          (select b.balance from credit_balances b where b.user_id = l.user_id), 0)
      ) > 0.0001
    ) drifted" | tr -d '[:space:]')
  [ "${drift:-0}" -eq 0 ] || die "$drift user(s) have ledger drift in the restored copy"

  log "verified: $tables tables, no ledger drift"
  trap - EXIT
  in_pg dropdb -U "$user" --if-exists --force "$scratch" >/dev/null
}

# ── Entry point ───────────────────────────────────────────────────────────────

main() {
  [ -f "$ENV_FILE" ] || die "missing $ENV_FILE"

  case "${1:-}" in
  --list)
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || log 'no dumps yet'
    return 0
    ;;
  --verify-restore)
    do_dump >/dev/null
    prune_old
    verify_restore
    ;;
  '')
    do_dump >/dev/null
    prune_old
    ;;
  *) die "unknown argument: $1" ;;
  esac

  write_metrics 1
  log 'done'
}

main "$@"
