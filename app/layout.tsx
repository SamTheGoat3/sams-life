import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Sam's Life",
  description: 'Your personal AI assistant',
  manifest: '/manifest.json',
  themeColor: '#0f0f0f',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Sam's Life" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0f0f0f', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
