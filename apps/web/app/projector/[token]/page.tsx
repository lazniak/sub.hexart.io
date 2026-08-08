'use client'

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { RelayMessage, TailMode } from '@sub/contracts'
import {
  INITIAL_STATE,
  applyRelayMessage,
  cardBlocks,
  readOverrides,
  resolveRender,
  selectActiveCard,
  toLines,
  type LineParts,
  type TextBlock,
} from '../lib/caption-store'
import { CARD_SWAP_MS, ROLL_UP_MS, asStyle, stylePreset } from '../lib/styles'
import { useProjectorSocket } from '../lib/use-projector-socket'

/**
 * Caption surface for an OBS Browser Source.
 *
 * Nothing renders here that the viewer did not ask for: no errors, no credit
 * warnings, no connection state, no branding beyond the trial watermark
 * (PRODUCT.md §4 — "zero UI"). A failed socket, an invalid token or a malformed
 * frame all resolve to the same thing — the surface simply keeps showing the
 * last good frame, and the studio is where the operator learns something broke.
 */

interface ProjectorPageProps {
  params: Promise<{ token: string }>
}

export default function ProjectorPage({ params }: ProjectorPageProps) {
  return (
    <Suspense fallback={null}>
      <CaptionSurface params={params} />
    </Suspense>
  )
}

function CaptionSurface({ params }: ProjectorPageProps) {
  const { token } = use(params)
  const query = useSearchParams()
  const [state, setState] = useState(INITIAL_STATE)

  const onMessage = useCallback((msg: RelayMessage) => {
    setState((prev) => applyRelayMessage(prev, msg))
  }, [])

  useProjectorSocket({ token, role: 'captions', onMessage })

  const overrides = useMemo(() => readOverrides(query), [query])
  const render = resolveRender(state.render, overrides.render)
  const preset = stylePreset(render.style)
  const visibleLines = preset.maxLines ?? render.maxLines

  const card = selectActiveCard(state.cards, render.mode)
  const blocks = card ? cardBlocks(card, render, overrides.lang) : []
  const ghost = useRetractGhost(card?.cardId ?? null, card?.rev ?? 0, blocks)

  const rootStyle = asStyle({
    ...preset.vars,
    '--sub-font-size': `${render.fontSize}px`,
    '--sub-line-h': `${Math.round(render.fontSize * 1.3)}px`,
    '--sub-visible-lines': String(visibleLines),
    // safeAreaPct is a share of the shorter viewport edge, which is what vmin is.
    '--sub-safe': `${render.safeAreaPct}vmin`,
    '--sub-swap-ms': `${CARD_SWAP_MS}ms`,
    '--sub-roll-ms': `${ROLL_UP_MS}ms`,
  })

  return (
    <div className="projector-root" style={rootStyle}>
      <div className="sub-stage">
        {ghost ? (
          <div className="sub-card sub-card--out" key={ghost.key} aria-hidden="true">
            {ghost.blocks.map((block) => (
              <LineStack
                key={block.key}
                block={block}
                visibleLines={visibleLines}
                tail={render.tail}
              />
            ))}
          </div>
        ) : null}

        {card && blocks.length > 0 ? (
          <div className="sub-card" key={`${card.cardId}:${card.rev}`}>
            {blocks.map((block) => (
              <LineStack
                key={block.key}
                block={block}
                visibleLines={visibleLines}
                tail={render.tail}
              />
            ))}
          </div>
        ) : null}
      </div>

      {state.watermark ? <div className="sub-watermark">sub.hexart.io</div> : null}
    </div>
  )
}

interface LineStackProps {
  block: TextBlock
  visibleLines: number
  tail: TailMode
}

/**
 * One language block, clipped to the line budget.
 *
 * Roll-up keeps one extra line above the window. The stack rests one line high
 * and animates in from zero, so the departing line travels out of the clip while
 * the rest shift up — a single 120 ms translateY, no layout involved.
 */
function LineStack({ block, visibleLines, tail }: LineStackProps) {
  const lines = toLines(block)
  const start = Math.max(0, lines.length - visibleLines)
  const rolling = start > 0
  const visible = lines.slice(rolling ? start - 1 : start, start + visibleLines)

  return (
    <div className="sub-block sub-lines">
      <div
        // Remounting on a window shift is what replays the roll-up animation.
        key={`roll-${start}`}
        className={rolling ? 'sub-lines-inner sub-lines-inner--roll' : 'sub-lines-inner'}
      >
        {visible.map((line) => (
          <Line key={line.key} line={line} tail={tail} />
        ))}
      </div>
    </div>
  )
}

function Line({ line, tail }: { line: LineParts; tail: TailMode }) {
  const showTail = tail === 'ghost' && line.tail.length > 0
  const empty = line.stable.length === 0 && !showTail

  return (
    <div className="sub-line">
      {empty ? null : (
        <span className="sub-badge">
          <span className="sub-text sub-text--stable">{line.stable}</span>
          {showTail ? <span className="sub-text sub-text--tail">{line.tail}</span> : null}
        </span>
      )}
    </div>
  )
}

interface GhostView {
  key: string
  blocks: TextBlock[]
}

/**
 * Holds the pre-retract revision of a card alive for the length of the
 * crossfade. Only a revision bump on the same card triggers it — an ordinary
 * card change is a normal fade-in, not a correction.
 */
function useRetractGhost(
  cardId: string | null,
  rev: number,
  blocks: TextBlock[],
): GhostView | null {
  const previous = useRef<{ cardId: string; rev: number; blocks: TextBlock[] } | null>(null)
  const [ghost, setGhost] = useState<GhostView | null>(null)

  // Runs before the snapshot effect below, so it still sees the old revision.
  useEffect(() => {
    const prev = previous.current
    if (!cardId || !prev || prev.cardId !== cardId || prev.rev === rev) return undefined

    setGhost({ key: `${prev.cardId}:${prev.rev}`, blocks: prev.blocks })
    const timer = setTimeout(() => setGhost(null), CARD_SWAP_MS)
    // Dropping the ghost here too: if the card changes mid-crossfade the timer is
    // cancelled, and without this the outgoing revision would stay mounted for
    // the rest of the session, overlapping whatever comes next.
    return () => {
      clearTimeout(timer)
      setGhost(null)
    }
  }, [cardId, rev])

  useEffect(() => {
    previous.current = cardId ? { cardId, rev, blocks } : null
  })

  return ghost
}
