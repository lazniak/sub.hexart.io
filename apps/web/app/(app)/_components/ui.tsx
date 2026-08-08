import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({
  title,
  actions,
  children,
}: {
  title?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-ink-soft p-5">
      {title || actions ? (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
          ) : null}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-sm text-muted">{hint}</div> : null}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'ghost', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-accent text-ink',
    ghost: 'border border-line text-paper hover:border-muted',
    danger: 'border border-danger text-danger hover:bg-danger hover:text-ink',
  }[variant]
  return (
    <button
      className={`rounded px-3 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export const controlClass =
  'w-full rounded border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-accent'

export function Notice({
  level,
  children,
}: {
  level: 'info' | 'warn' | 'error'
  children: ReactNode
}) {
  const tone = {
    info: 'border-line text-muted',
    warn: 'border-warn text-warn',
    error: 'border-danger text-danger',
  }[level]
  return (
    <div role="status" className={`rounded border px-3 py-2 text-sm ${tone}`}>
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>
}
