import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://sub.hexart.io'),
  title: {
    default: 'sub.hexart.io — napisy na żywo do OBS',
    template: '%s · sub.hexart.io',
  },
  description:
    'Napisy na żywo, tłumaczenie i lektor AI dla OBS. Wybierasz mikrofon i język, dostajesz link do Browser Source.',
  openGraph: {
    type: 'website',
    locale: 'pl_PL',
    siteName: 'sub.hexart.io',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0b0d10',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  )
}
