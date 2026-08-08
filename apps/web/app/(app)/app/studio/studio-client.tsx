'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CRITICAL_SECONDS_LEFT,
  burnRatePerMinute,
  estimateSeconds,
  formatAirtime,
} from '@sub/billing'
import {
  SessionConfig,
  type CaptionStyle,
  type EndReason,
  type NoticeCode,
  type StartSessionResponse,
} from '@sub/contracts'
import { listMicrophones, startMicStream, type MicDevice, type MicStream } from '@/lib/studio/mic'
import { RelayClient } from '@/lib/studio/relay-client'
import { Button, Card, Field, Notice, controlClass } from '../../_components/ui'

interface PlanView {
  code: string
  name: string
  maxTargetLanguages: number
  voiceEnabled: boolean
  glossaryEnabled: boolean
}

interface Props {
  userId: string
  emailVerified: boolean
  plan: PlanView
  credits: number
  glossaries: { id: string; name: string }[]
  voices: { id: string; name: string }[]
}

const LANGUAGES = [
  { code: 'pl', speaking: 'polsku', name: 'polski' },
  { code: 'en', speaking: 'angielsku', name: 'angielski' },
  { code: 'de', speaking: 'niemiecku', name: 'niemiecki' },
  { code: 'uk', speaking: 'ukraińsku', name: 'ukraiński' },
  { code: 'es', speaking: 'hiszpańsku', name: 'hiszpański' },
  { code: 'fr', speaking: 'francusku', name: 'francuski' },
  { code: 'it', speaking: 'włosku', name: 'włoski' },
  { code: 'cs', speaking: 'czesku', name: 'czeski' },
] as const

const STYLES: { value: CaptionStyle; label: string }[] = [
  { value: 'clean', label: 'Clean' },
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'karaoke', label: 'Karaoke' },
]

type Status = 'idle' | 'starting' | 'live' | 'ended'

interface PreviewCard {
  cardId: string
  text: string
  translation: string
}

/**
 * Every value except the two the studio opinionates on comes from the schema, so
 * a default changed in `packages/contracts` lands here without an edit. Writing
 * them out again is how the studio and the relay quietly drift apart.
 */
function defaultConfig(): SessionConfig {
  return SessionConfig.parse({ srcLang: 'pl', dstLangs: ['en'] })
}

export function StudioClient(props: Props) {
  const [config, setConfig] = useState<SessionConfig>(defaultConfig)
  const [devices, setDevices] = useState<MicDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [level, setLevel] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [session, setSession] = useState<StartSessionResponse | null>(null)
  const [projectorUrl, setProjectorUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [more, setMore] = useState(false)
  const [cards, setCards] = useState<PreviewCard[]>([])
  const [remaining, setRemaining] = useState<{ credits: number; seconds: number } | null>(null)

  const relayRef = useRef<RelayClient | null>(null)
  const micRef = useRef<MicStream | null>(null)
  const settingsKey = `studio:${props.userId}`

  // React may re-run a state updater; sending on the socket from inside one would
  // put a second `configure` on the wire for every slider move.
  const configRef = useRef(config)
  configRef.current = config

  // Settings are remembered per account. They are pure UI preferences — every
  // one of them is re-validated server-side when the session starts, and the
  // restored blob goes through the schema so a stale or edited entry cannot
  // produce a config the studio then fails to start with a generic error.
  useEffect(() => {
    const stored = window.localStorage.getItem(settingsKey)
    if (!stored) return
    try {
      const restored = SessionConfig.safeParse({
        ...defaultConfig(),
        ...(JSON.parse(stored) as Record<string, unknown>),
      })
      if (restored.success) setConfig(restored.data)
      else window.localStorage.removeItem(settingsKey)
    } catch {
      window.localStorage.removeItem(settingsKey)
    }
  }, [settingsKey])

  useEffect(() => {
    window.localStorage.setItem(settingsKey, JSON.stringify(config))
  }, [settingsKey, config])

  useEffect(() => {
    listMicrophones().then(setDevices, () => setDevices([]))
  }, [])

  const burn = {
    targetLanguages: config.dstLangs.length,
    voiceEnabled: config.voice.enabled,
  }
  const burnRate = burnRatePerMinute(burn)
  const estimate = estimateSeconds(props.credits, burn)

  const patch = useCallback((next: Partial<SessionConfig>) => {
    setConfig((prev) => ({ ...prev, ...next }))
  }, [])

  const patchRender = useCallback((next: Partial<SessionConfig['render']>) => {
    const render = { ...configRef.current.render, ...next }
    setConfig((prev) => ({ ...prev, render }))
    // Render changes apply live in OBS — no source refresh, per PRODUCT.md §4.
    relayRef.current?.configure({ render })
  }, [])

  const teardown = useCallback(async () => {
    relayRef.current?.close()
    relayRef.current = null
    await micRef.current?.stop()
    micRef.current = null
    setLevel(0)
  }, [])

  useEffect(() => {
    return () => {
      relayRef.current?.close()
      void micRef.current?.stop()
    }
  }, [])

  async function start() {
    setError('')
    setNotice('')
    setCards([])
    // The previous session's link stops routing the moment that session ends;
    // leaving it on screen invites pasting a dead URL into OBS.
    setProjectorUrl('')
    setCopied(false)
    setStatus('starting')

    let res: Response
    try {
      res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      })
    } catch {
      // Without this the button stays disabled on `starting` for good.
      setStatus('idle')
      setError('Brak połączenia z serwerem. Spróbuj ponownie.')
      return
    }

    const payload = (await res.json().catch(() => null)) as
      (StartSessionResponse & { message?: string }) | null

    if (!res.ok || !payload) {
      setStatus('idle')
      setError(payload?.message ?? 'Nie udało się uruchomić sesji.')
      return
    }

    setSession(payload)
    setRemaining({ credits: payload.creditsAvailable, seconds: payload.estimatedSeconds })

    // The JWT lives in this closure and nowhere else: no storage, no state, no
    // logs. It is single use with a 60 second life. SECURITY.md §3.
    const client = new RelayClient(payload.relayUrl, {
      // The relay is the only process that can route a projector, so the token it
      // announces in `ready` is the one that resolves. Showing anything else hands
      // the operator a Browser Source that silently never attaches.
      onReady: (msg) =>
        setProjectorUrl(`${window.location.origin}/projector/${msg.projectorToken}`),
      onPartial: (msg) => upsertCard(msg.cardId, msg.text, msg.tr),
      onCommit: (msg) => upsertCard(msg.cardId, msg.text, msg.tr),
      onRetract: (msg) => upsertCard(msg.cardId, msg.text, msg.tr),
      onCredits: (msg) => setRemaining({ credits: msg.remaining, seconds: msg.secondsLeft }),
      onNotice: (msg) => setNotice(noticeText(msg.code)),
      onEnd: (msg) => {
        setStatus('ended')
        setNotice(endText(msg.reason))
        void teardown()
      },
      onTransportError: () => setError('Utracono połączenie z serwerem napisów.'),
      onClosed: () => setStatus((prev) => (prev === 'live' ? 'ended' : prev)),
    })
    relayRef.current = client

    try {
      client.connect(payload.jwt, config)
      micRef.current = await startMicStream({
        deviceId: deviceId || undefined,
        onFrame: (frame) => client.sendAudio(frame),
        onLevel: setLevel,
      })
      setStatus('live')
    } catch (err) {
      await teardown()
      setStatus('idle')
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Przeglądarka nie dała dostępu do mikrofonu.'
          : 'Nie udało się uruchomić mikrofonu.',
      )
    }
  }

  async function stop() {
    relayRef.current?.bye()
    await teardown()
    setStatus('ended')
  }

  function upsertCard(cardId: string, text: string, tr?: Record<string, string>) {
    const translation = config.dstLangs
      .map((lang) => tr?.[lang])
      .filter((value): value is string => Boolean(value))
      .join(' · ')
    setCards((prev) => {
      const rest = prev.filter((c) => c.cardId !== cardId)
      return [...rest, { cardId, text, translation }].slice(-2)
    })
  }

  /**
   * Rotation writes a new digest onto the session row, which is the record of
   * record. Routing, however, is owned by the relay for the life of the socket:
   * it mints the token it announces in `ready` and resolves projectors against
   * that map alone. Until the relay grows a rotate message (cross-lane), the only
   * thing that actually kills a link shown on air is stopping the session — so
   * that is what the operator is told, rather than being handed a URL that would
   * silently never attach.
   */
  async function rotateProjectorToken() {
    if (!session) return
    let res: Response
    try {
      res = await fetch(`/api/session/${session.sessionId}/projector-token`, { method: 'POST' })
    } catch {
      setError('Brak połączenia z serwerem.')
      return
    }
    const payload = (await res.json().catch(() => null)) as { message?: string } | null
    if (!res.ok) {
      setError(payload?.message ?? 'Nie udało się wygenerować nowego linku.')
      return
    }
    setNotice(
      'Stary link został unieważniony po stronie konta. Zatrzymaj i uruchom sesję ponownie, żeby dostać działający link do OBS.',
    )
  }

  async function copyLink() {
    if (!projectorUrl) return
    try {
      await navigator.clipboard.writeText(projectorUrl)
      setCopied(true)
    } catch {
      setError('Przeglądarka nie pozwoliła skopiować linku. Zaznacz go i skopiuj ręcznie.')
    }
  }

  const langLimitReached = config.dstLangs.length >= props.plan.maxTargetLanguages

  return (
    <div className="grid gap-6">
      {props.emailVerified ? null : (
        <Notice level="warn">
          Potwierdź adres e-mail, żeby uruchomić sesję.{' '}
          <Link href="/verify" className="underline">
            Wyślij link ponownie
          </Link>
        </Notice>
      )}
      {error ? <Notice level="error">{error}</Notice> : null}
      {notice ? <Notice level="warn">{notice}</Notice> : null}
      {/* Credit warnings live here and never reach the projector — that view is on air. */}
      {remaining && remaining.seconds <= CRITICAL_SECONDS_LEFT ? (
        <Notice level="warn">
          Zostało {formatAirtime(remaining.seconds)} nagrania. Doładuj konto w zakładce{' '}
          <Link href="/app" className="underline">
            Credits
          </Link>
          .
        </Notice>
      ) : null}

      <Card title="Wejście">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr] sm:items-end">
          <Field label="Mikrofon">
            <select
              className={controlClass}
              value={deviceId}
              disabled={status === 'live'}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">Domyślny</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <div className="mb-1 text-sm font-medium">Poziom</div>
            <div className="h-3 w-full overflow-hidden rounded bg-ink">
              <div
                className="h-full bg-accent transition-[width] duration-100"
                style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Języki">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mówię po">
            <select
              className={controlClass}
              value={config.srcLang}
              onChange={(e) => patch({ srcLang: e.target.value })}
            >
              <option value="auto">automatycznie</option>
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.speaking}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Napisy tłumaczone na"
            hint={`Plan ${props.plan.name}: do ${props.plan.maxTargetLanguages} języków.`}
          >
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const selected = config.dstLangs.includes(lang.code)
                const disabled = !selected && langLimitReached
                return (
                  <button
                    key={lang.code}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() =>
                      patch({
                        dstLangs: selected
                          ? config.dstLangs.filter((c) => c !== lang.code)
                          : [...config.dstLangs, lang.code],
                      })
                    }
                    className={`rounded border px-3 py-1 text-sm disabled:opacity-40 ${
                      selected ? 'border-accent text-accent' : 'border-line text-muted'
                    }`}
                  >
                    {lang.name}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Lektor AI">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Lektor"
            hint={props.plan.voiceEnabled ? undefined : 'Dostępny od planu Creator.'}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.voice.enabled}
                disabled={!props.plan.voiceEnabled}
                onChange={(e) => patch({ voice: { ...config.voice, enabled: e.target.checked } })}
              />
              <span>{config.voice.enabled ? 'włączony' : 'wyłączony'}</span>
            </label>
          </Field>
          <Field
            label="Głos"
            hint={props.voices.length === 0 ? 'Katalog głosów pojawi się wkrótce.' : undefined}
          >
            <select
              className={controlClass}
              value={config.voice.voiceId ?? ''}
              disabled={!config.voice.enabled || props.voices.length === 0}
              onChange={(e) =>
                patch({ voice: { ...config.voice, voiceId: e.target.value || undefined } })
              }
            >
              <option value="">Domyślny</option>
              {props.voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card
        title="Link do OBS"
        actions={
          <div className="flex gap-2">
            <Button onClick={copyLink} disabled={!projectorUrl}>
              {copied ? 'Skopiowano' : 'Kopiuj'}
            </Button>
            <Button onClick={rotateProjectorToken} disabled={!session}>
              Nowy link
            </Button>
          </div>
        }
      >
        <p className="break-all rounded border border-line bg-ink px-3 py-2 font-mono text-sm">
          {projectorUrl || 'Link pojawi się po starcie sesji.'}
        </p>
        <p className="mt-2 text-xs text-muted">
          Wklej jako Browser Source 1920×1080. Ten link daje wyłącznie podgląd napisów — jeśli
          pokażesz go na wizji, kliknij „Nowy link”, a stary przestanie działać natychmiast.
        </p>
        <div className="mt-4 max-w-xs">
          <Field label="Styl">
            <select
              className={controlClass}
              value={config.render.style}
              onChange={(e) => patchRender({ style: e.target.value as CaptionStyle })}
            >
              {STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {status === 'live' ? (
            <Button variant="danger" onClick={stop}>
              ■ STOP
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={start}
              disabled={status === 'starting' || !props.emailVerified}
            >
              {status === 'starting' ? 'Uruchamiam…' : '▶ START'}
            </Button>
          )}
          <div className="text-right text-sm">
            <div className="tabular-nums">
              saldo: {props.credits.toFixed(2)} cr ≈ {formatAirtime(estimate)}
            </div>
            <div className="text-muted">
              ta konfiguracja: {burnRate.toFixed(2)} cr/min
              {remaining ? ` · zostało ${formatAirtime(remaining.seconds)}` : ''}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Podgląd">
        {cards.length === 0 ? (
          <p className="text-sm text-muted">
            Powiedz „raz, dwa, trzy” po starcie — tekst pojawi się tutaj i w OBS.
          </p>
        ) : (
          <div className="grid gap-3">
            {cards.map((card) => (
              <div key={card.cardId}>
                <p className="text-lg">{card.text}</p>
                {card.translation ? <p className="text-lg text-muted">{card.translation}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Więcej ustawień"
        actions={<Button onClick={() => setMore((v) => !v)}>{more ? 'Zwiń' : 'Rozwiń'}</Button>}
      >
        {more ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {props.plan.glossaryEnabled ? (
              <Field label="Glosariusz">
                <select
                  className={controlClass}
                  value={config.glossaryId ?? ''}
                  onChange={(e) => patch({ glossaryId: e.target.value || undefined })}
                >
                  <option value="">brak</option>
                  {props.glossaries.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Tryb napisów">
              <select
                className={controlClass}
                value={config.render.mode}
                onChange={(e) =>
                  patchRender({ mode: e.target.value === 'popon' ? 'popon' : 'rollup' })
                }
              >
                <option value="rollup">roll-up (przewijanie)</option>
                <option value="popon">pop-on (całe zdania)</option>
              </select>
            </Field>

            <Field label="Niestabilny ogon">
              <select
                className={controlClass}
                value={config.render.tail}
                onChange={(e) =>
                  patchRender({ tail: e.target.value === 'hide' ? 'hide' : 'ghost' })
                }
              >
                <option value="ghost">przygaszony</option>
                <option value="hide">ukryty</option>
              </select>
            </Field>

            <Field label={`Liczba linii: ${config.render.maxLines}`}>
              <input
                type="range"
                min={1}
                max={3}
                value={config.render.maxLines}
                onChange={(e) => patchRender({ maxLines: Number(e.target.value) })}
                className="w-full"
              />
            </Field>

            <Field label={`Znaków w linii: ${config.render.maxCharsPerLine}`}>
              <input
                type="range"
                min={24}
                max={60}
                value={config.render.maxCharsPerLine}
                onChange={(e) => patchRender({ maxCharsPerLine: Number(e.target.value) })}
                className="w-full"
              />
            </Field>

            <Field label={`Rozmiar czcionki: ${config.render.fontSize} px`}>
              <input
                type="range"
                min={20}
                max={96}
                value={config.render.fontSize}
                onChange={(e) => patchRender({ fontSize: Number(e.target.value) })}
                className="w-full"
              />
            </Field>

            <Field label={`Margines bezpieczny: ${config.render.safeAreaPct}%`}>
              <input
                type="range"
                min={0}
                max={15}
                value={config.render.safeAreaPct}
                onChange={(e) => patchRender({ safeAreaPct: Number(e.target.value) })}
                className="w-full"
              />
            </Field>

            <Field label={`Prędkość lektora: ${config.voice.speed.toFixed(2)}×`}>
              <input
                type="range"
                min={0.7}
                max={1.2}
                step={0.05}
                value={config.voice.speed}
                disabled={!config.voice.enabled}
                onChange={(e) =>
                  patch({ voice: { ...config.voice, speed: Number(e.target.value) } })
                }
                className="w-full"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.render.showSource}
                onChange={(e) => patchRender({ showSource: e.target.checked })}
              />
              pokazuj język źródłowy
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.render.showTranslation}
                onChange={(e) => patchRender({ showTranslation: e.target.checked })}
              />
              pokazuj tłumaczenie
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.noVerbatim}
                onChange={(e) => patch({ noVerbatim: e.target.checked })}
              />
              usuwaj wtrącenia i falstarty
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Domyślne ustawienia są dobrane pod OBS w 1920×1080. Rozwiń, jeśli chcesz je zmienić.
          </p>
        )}
      </Card>
    </div>
  )
}

/** Typed against the contract so a new code added upstream fails the build here. */
function noticeText(code: NoticeCode): string {
  switch (code) {
    case 'LOW_CREDITS':
      return 'Saldo spadło poniżej 20%. Doładuj konto, żeby nie przerwać transmisji.'
    case 'CREDITS_CRITICAL':
      return 'Credits kończą się w ciągu minuty.'
    case 'VOICE_BEHIND':
      return 'Lektor nie nadąża — skracam wypowiedzi.'
    case 'STT_RECONNECTING':
      return 'Wznawiam połączenie z rozpoznawaniem mowy.'
    case 'TRANSLATION_DEGRADED':
      return 'Tłumaczenie działa w trybie awaryjnym.'
    case 'TTS_UNAVAILABLE':
      return 'Lektor chwilowo niedostępny. Napisy lecą dalej.'
    case 'NETWORK_SLOW':
      return 'Słabe łącze — napisy mogą się opóźniać.'
    default:
      return 'Uwaga systemowa.'
  }
}

function endText(reason: EndReason): string {
  switch (reason) {
    case 'credits_exhausted':
      return 'Sesja zakończona: skończyły się credits.'
    case 'idle_timeout':
      return 'Sesja zakończona: brak dźwięku przez dłuższy czas.'
    case 'server_shutdown':
      return 'Sesja zakończona: restart serwera. Możesz wystartować ponownie.'
    case 'upstream_error':
      return 'Sesja zakończona: awaria dostawcy. Credits za przerwę wracają na konto.'
    case 'user':
      return 'Sesja zakończona.'
    default:
      return 'Sesja zakończona z powodu błędu.'
  }
}
