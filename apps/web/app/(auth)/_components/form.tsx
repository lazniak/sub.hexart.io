import type { InputHTMLAttributes, ReactNode } from 'react'

export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string
  lead?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="w-full max-w-md rounded-lg border border-line bg-ink-soft p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      {lead ? <p className="mt-2 text-sm text-muted">{lead}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="mt-6 border-t border-line pt-4 text-sm text-muted">{footer}</div>
      ) : null}
    </div>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export function Field({ label, hint, id, ...props }: FieldProps) {
  const inputId = id ?? props.name ?? label
  return (
    <label className="mb-4 block" htmlFor={inputId}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        id={inputId}
        className="w-full rounded border border-line bg-ink px-3 py-2 text-paper outline-none focus:border-accent"
        {...props}
      />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded bg-accent px-4 py-2 font-medium text-ink disabled:opacity-50"
    >
      {busy ? 'Chwileczkę…' : children}
    </button>
  )
}

export function FormMessage({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  const color = tone === 'error' ? 'text-danger' : 'text-accent'
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 text-sm ${color}`}>
      {children}
    </p>
  )
}

/** Every auth endpoint answers with `{ error, message }` on failure. */
export async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true, message: '' }
    const payload = (await res.json().catch(() => null)) as { message?: string } | null
    return { ok: false, message: payload?.message ?? 'Coś poszło nie tak. Spróbuj ponownie.' }
  } catch {
    return { ok: false, message: 'Brak połączenia z serwerem.' }
  }
}
