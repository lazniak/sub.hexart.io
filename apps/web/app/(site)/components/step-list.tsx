interface Step {
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Wybierz mikrofon i język',
    body: 'Źródło dźwięku i to, na jakie języki tłumaczyć.',
  },
  {
    title: 'Skopiuj link do OBS',
    body: 'Browser Source, przezroczyste tło, gotowe.',
  },
  {
    title: 'Mów',
    body: 'Napisy pojawiają się po około 0,4 s. Lektor po około 1 s.',
  },
]

export function StepList() {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className="rounded-lg border border-line bg-ink-soft p-5 text-sm text-muted"
        >
          <span
            aria-hidden="true"
            className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-accent text-sm font-semibold text-accent"
          >
            {index + 1}
          </span>
          <h3 className="mb-1 text-base font-semibold text-paper">{step.title}</h3>
          <p>{step.body}</p>
        </li>
      ))}
    </ol>
  )
}
