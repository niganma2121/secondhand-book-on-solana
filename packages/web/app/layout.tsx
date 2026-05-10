import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/providers/auth-provider'
import { CommKeyBootstrap } from '@/components/providers/comm-key-bootstrap'
import { SolanaProvider } from '@/components/providers/solana-provider'
import { cn } from '@/lib/utils'
import './globals.css'

export const metadata: Metadata = {
  title: 'BookChain — 二手书区块链交易平台',
  description: '基于 Solana 的去中心化二手书交易平台，每本书铸造为 NFT，链上交易，安全透明可信赖。',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn(
        'bg-background dark',
        process.env.NODE_ENV === 'development' && 'theme-dev',
      )}
    >
      <body className="font-sans antialiased">
        <SolanaProvider>
          <AuthProvider>
            <CommKeyBootstrap />
            {children}
          </AuthProvider>
        </SolanaProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
