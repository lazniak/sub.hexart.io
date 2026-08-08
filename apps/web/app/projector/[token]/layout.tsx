import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../projector.css'

/**
 * The projector gets no app shell: no navigation, no providers, no analytics,
 * no third-party scripts. Whatever renders under this layout is composited onto
 * somebody's live broadcast, and nothing else is allowed on that frame.
 *
 * The CSP for `/projector/*` (apps/web/next.config.ts) is the enforcement; this
 * layout is the reason there is nothing for it to block.
 */

/** Session-scoped and purely client-rendered — there is nothing to prerender. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // The token appears in the OBS Browser Source properties; keep it out of titles.
  title: { absolute: 'projector' },
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function ProjectorLayout({ children }: { children: ReactNode }) {
  return children
}
