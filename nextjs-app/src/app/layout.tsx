import type { Metadata } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const notoSansKR = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: {
    default: process.env.NEXT_PUBLIC_APP_NAME ?? 'Dashboard',
    template: `%s | ${process.env.NEXT_PUBLIC_APP_NAME ?? 'Dashboard'}`,
  },
  description: 'Next.js 14 App Router Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={notoSansKR.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
