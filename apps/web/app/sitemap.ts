import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sub.hexart.io'

/** Public surface only. /app, /api and /projector are excluded by robots.txt too. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    { path: '', priority: 1 },
    { path: '/pricing', priority: 0.8 },
    { path: '/legal/regulamin', priority: 0.3 },
    { path: '/legal/prywatnosc', priority: 0.3 },
    { path: '/legal/cookies', priority: 0.2 },
    { path: '/legal/podprocesorzy', priority: 0.2 },
    { path: '/legal/dpa', priority: 0.2 },
  ]

  return pages.map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly',
    priority,
  }))
}
