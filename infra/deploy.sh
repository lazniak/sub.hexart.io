#!/usr/bin/env bash
#
# Deploy sub.hexart.io onto the single VPS.
#
#   ./infra/deploy.sh              # deploy origin/main
#   ./infra/deploy.sh --rollback   # go back to the previous image tag
#   ./infra/deploy.sh --dry-run    # preflight only, change nothing
#
# Safe to re-run: every step is idempotent, and a failed post-deploy health
# check rolls the stack back to the previous image tag automatically.
#
# What it does NOT roll back: database migrations. Those are forward-only. If a
# migration is the thing that broke, restore from backup.sh — see infra/README.md.

set -Eeuo pipefail

# The whole script lives in functions and is invoked from the last line, so bash
# has parsed all of it before the first `git pull` can rewrite the file on disk.

INFRA_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd -- "$INFRA_DIR/.." && pwd)
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/.env}"
STATE_FILE="$INFRA_DIR/.deploy-state"
LOCK_FILE="${LOCK_FILE:-/tmp/sub-hexart-deploy.lock}"

BRANCH="${DEPLOY_BRANCH:-main}"
SITE_URL="${SITE_URL:-https://sub.hexart.io}"
RELAY_URL="${RELAY_URL:-https://relay.sub.hexart.io}"
# Must exceed the relay's stop_grace_period (630s): `up -d` stops the old relay
# before it can wait for the new one, and a live session makes that stop take the
# full drain. A timeout shorter than the drain turns a healthy deploy into a
# spurious rollback.
WAIT_TIMEOUT="${WAIT_TIMEOUT:-900}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
KEEP_TAGS="${KEEP_TAGS:-5}"

log() { printf '[deploy] %s  %s\n' "$(date -u '+%H:%M:%S')" "$*" >&2; }
die() {
  printf '[deploy] %s  FATAL: %s\n' "$(date -u '+%H:%M:%S')" "$*" >&2
  exit 1
}

# Every image in docker-compose.yml is tagged `${IMAGE_TAG}`. Exporting it once
# is what makes both the deploy and the rollback a single-variable operation.
export IMAGE_TAG="${IMAGE_TAG:-local}"

compose() {
  docker compose --project-directory "$INFRA_DIR" --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" "$@"
}

# ── Preflight ─────────────────────────────────────────────────────────────────

decrypt_env() {
  local enc="$INFRA_DIR/secrets/prod.enc.env"
  [ -f "$enc" ] || return 0
  command -v sops >/dev/null 2>&1 || die "secrets/prod.enc.env exists but sops is not installed"
  [ -n "${SOPS_AGE_KEY_FILE:-}" ] || die 'SOPS_AGE_KEY_FILE is not set'
  [ -r "${SOPS_AGE_KEY_FILE}" ] || die "cannot read age key at ${SOPS_AGE_KEY_FILE}"
  log 'decrypting secrets/prod.enc.env'
  # Write through a private temp file so a failed decrypt never truncates a
  # working .env, and the plaintext is never briefly world-readable.
  local tmp
  tmp=$(mktemp "$INFRA_DIR/.env.XXXXXX")
  chmod 600 "$tmp"
  sops --decrypt --output-type dotenv "$enc" >"$tmp" || {
    rm -f "$tmp"
    die 'sops decrypt failed'
  }
  mv -f "$tmp" "$ENV_FILE"
}

preflight() {
  local mode="$1"

  command -v docker >/dev/null 2>&1 || die 'docker is not installed'
  docker compose version >/dev/null 2>&1 || die 'docker compose v2 plugin is missing'
  command -v curl >/dev/null 2>&1 || die 'curl is not installed'
  command -v git >/dev/null 2>&1 || die 'git is not installed'

  # --dry-run promises to change nothing, and decrypting rewrites infra/.env.
  [ "$mode" = 'dry-run' ] || decrypt_env
  [ -f "$ENV_FILE" ] || die "missing $ENV_FILE — see infra/secrets/README.md"

  local perms
  perms=$(stat -c '%a' "$ENV_FILE")
  [ "$perms" = '600' ] || die "$ENV_FILE must be mode 600, found $perms"

  # The ignore rules exist three times because BuildKit resolves them next to
  # the Dockerfile. Drift silently changes what lands in the image.
  local f
  for f in Dockerfile.web Dockerfile.relay; do
    cmp -s "$INFRA_DIR/.dockerignore" "$INFRA_DIR/$f.dockerignore" ||
      die "$f.dockerignore has drifted from .dockerignore"
  done

  # Interpolation errors surface here rather than halfway through a deploy.
  compose config --quiet || die 'docker-compose.yml did not validate'
}

# ── State ─────────────────────────────────────────────────────────────────────

# The tag the running stack was last deployed at. Read BEFORE record_tag, so on
# the deploy path this is still the last known-good version to fall back to.
previous_tag() {
  [ -f "$STATE_FILE" ] || return 0
  head -n 1 "$STATE_FILE"
}

# Target for an explicit `--rollback`. Line 1 is what is running right now —
# rolling back to it would be a no-op — so the target is the line before it.
rollback_target() {
  [ -f "$STATE_FILE" ] || return 0
  sed -n '2p' "$STATE_FILE"
}

record_tag() {
  local tag="$1" rest=''
  if [ -f "$STATE_FILE" ]; then
    rest=$(grep -vFx "$tag" "$STATE_FILE" || true)
  fi
  printf '%s\n%s' "$tag" "$rest" | sed '/^$/d' | head -n "$KEEP_TAGS" >"$STATE_FILE.tmp"
  mv -f "$STATE_FILE.tmp" "$STATE_FILE"
}

# After a manual rollback the head entry is the version we just left. Dropping it
# keeps the file's invariant — line 1 is what is running — so a second
# `--rollback` steps one version further back instead of returning here.
drop_head_tag() {
  [ -f "$STATE_FILE" ] || return 0
  tail -n +2 "$STATE_FILE" >"$STATE_FILE.tmp"
  mv -f "$STATE_FILE.tmp" "$STATE_FILE"
}

# ── Steps ─────────────────────────────────────────────────────────────────────

sync_repo() {
  log "fetching origin/$BRANCH"
  git -C "$REPO_DIR" fetch --prune --quiet origin
  # Unconditional checkout: a previous rollback may have left a detached HEAD.
  git -C "$REPO_DIR" checkout --quiet "$BRANCH"
  git -C "$REPO_DIR" merge --ff-only --quiet "origin/$BRANCH"
}

build_images() {
  log "building images at $IMAGE_TAG"
  compose build --pull
  compose --profile tools build --pull migrate
}

start_data_tier() {
  log 'starting postgres and redis'
  compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" postgres redis
}

run_migrations() {
  if [ -z "$(find "$REPO_DIR/packages/db/migrations" -name '*.sql' -print -quit 2>/dev/null)" ]; then
    log 'no migrations present — skipping'
    return 0
  fi
  log 'running migrations'
  compose --profile tools run --rm migrate ||
    die 'migration failed — the stack was left on the previous version'
}

start_app_tier() {
  # `up -d` recreates only what changed. The relay's stop_grace_period gives
  # live sessions their drain window; expect this call to take that long when a
  # broadcast is in flight.
  log "starting application tier at $IMAGE_TAG"
  compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" --remove-orphans
}

check_url() {
  local url="$1" want="$2" code=''
  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || true)
    case "$code" in
    "$want")
      log "ok  $url -> $code"
      return 0
      ;;
    esac
    sleep 3
  done
  log "FAILED  $url -> ${code:-no response} after $HEALTH_RETRIES attempts"
  return 1
}

health_check() {
  # Through the public hostname on purpose: this exercises DNS, the certificate
  # and the Caddy routing, not just the container's own probe.
  check_url "$SITE_URL/" 200 || return 1
  check_url "$RELAY_URL/healthz" 200 || return 1
}

rollback_to() {
  local tag="$1"
  [ -n "$tag" ] || die "no rollback target in $STATE_FILE — nothing older than the running version was recorded"
  log "ROLLING BACK to $tag"
  IMAGE_TAG="$tag"
  # The working tree is left alone: re-reading the compose file from another
  # revision while this script is running is a good way to make a bad situation
  # worse. If the compose file or Caddyfile is itself the fault, check out the
  # old revision by hand and re-run this script.
  compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" ||
    die "rollback to $tag did not come up — manual intervention required"
  health_check || die "rollback to $tag is unhealthy — manual intervention required"
  log "rolled back to $tag; migrations were NOT reverted"
}

prune() {
  log 'pruning dangling images and old build cache'
  docker image prune -f >/dev/null
  docker builder prune -f --filter 'until=168h' >/dev/null

  # Keep exactly the tags in the state file so a rollback target always exists.
  local repo keep tag
  for repo in sub-hexart/web sub-hexart/relay sub-hexart/migrate; do
    while read -r tag; do
      [ -n "$tag" ] || continue
      [ "$tag" != 'local' ] || continue
      keep=$(grep -Fx "$tag" "$STATE_FILE" || true)
      if [ -z "$keep" ]; then
        log "removing $repo:$tag"
        docker image rm -f "$repo:$tag" >/dev/null 2>&1 || true
      fi
    done < <(docker image ls --format '{{.Tag}}' "$repo")
  done
}

# ── Entry point ───────────────────────────────────────────────────────────────

main() {
  local mode='deploy'
  case "${1:-}" in
  --rollback) mode='rollback' ;;
  --dry-run) mode='dry-run' ;;
  '') ;;
  *) die "unknown argument: $1" ;;
  esac

  command -v flock >/dev/null 2>&1 || die 'flock is missing — install util-linux'
  exec 9>"$LOCK_FILE"
  flock -n 9 || die 'another deploy is already running'

  preflight "$mode"

  if [ "$mode" = 'dry-run' ]; then
    log 'preflight passed; nothing changed'
    return 0
  fi

  local prev
  prev=$(previous_tag || true)

  if [ "$mode" = 'rollback' ]; then
    local target
    target=$(rollback_target || true)
    rollback_to "$target"
    drop_head_tag
    return 0
  fi

  sync_repo
  local tag
  tag=$(git -C "$REPO_DIR" rev-parse --short=12 HEAD)

  if [ "$tag" = "$prev" ]; then
    log "already at $tag — re-running to converge the running stack"
  fi
  IMAGE_TAG="$tag"

  build_images
  start_data_tier
  run_migrations

  if ! start_app_tier || ! health_check; then
    log 'deploy failed'
    if [ -n "$prev" ] && [ "$prev" != "$tag" ]; then
      rollback_to "$prev"
      die "deploy of $tag failed; rolled back to $prev"
    fi
    die "deploy of $tag failed and there is no previous tag to roll back to"
  fi

  record_tag "$tag"
  prune
  log "deployed $tag"
}

main "$@"
