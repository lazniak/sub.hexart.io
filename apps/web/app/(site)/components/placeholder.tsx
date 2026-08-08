/**
 * A fact we do not have yet.
 *
 * Rendered loud and machine-greppable so a missing registration number can never
 * be mistaken for a real one, and so a pre-launch review can find every gap.
 */
export function Placeholder({ what }: { what: string }) {
  return (
    <mark className="rounded bg-accent-dim px-1.5 py-0.5 font-mono text-[0.85em] text-warn">
      [DO UZUPEŁNIENIA: {what}]
    </mark>
  )
}
