import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Slipless',
  description: 'AI receptionist for missed calls',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
