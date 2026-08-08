interface Tile {
  title: string
  body: string
}

const TILES: Tile[] = [
  {
    title: 'Streamerzy',
    body: 'Widzowie z całego świata czytają Twój stream w swoim języku. Jedno źródło w OBS.',
  },
  {
    title: 'Webinary i konferencje',
    body: 'Prelekcja po polsku, napisy po angielsku. Bez tłumacza w kabinie i bez montażu.',
  },
  {
    title: 'Dostępność',
    body: 'Napisy w języku źródłowym dla osób niesłyszących i słabosłyszących — od pierwszej minuty.',
  },
]

export function AudienceTiles() {
  return (
    <ul className="grid gap-4 sm:grid-cols-3">
      {TILES.map((tile) => (
        <li key={tile.title} className="rounded-lg border border-line p-5">
          <h3 className="mb-1 text-base font-semibold text-paper">{tile.title}</h3>
          <p className="text-sm text-muted">{tile.body}</p>
        </li>
      ))}
    </ul>
  )
}
