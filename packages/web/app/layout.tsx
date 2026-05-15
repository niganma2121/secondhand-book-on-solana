import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/providers/auth-provider'
import { CommKeyBootstrap } from '@/components/providers/comm-key-bootstrap'
import { SolanaProvider } from '@/components/providers/solana-provider'
import { BOOKCHAIN_LOGO_SRC } from '@/lib/brand'
import { cn } from '@/lib/utils'
import './globals.css'

export const metadata: Metadata = {
  title: 'BookChain — 二手书区块链交易平台',
  description: '基于 Solana 的去中心化二手书交易平台，每本书铸造为 NFT，链上交易，安全透明可信赖。',
  icons: {
    icon: BOOKCHAIN_LOGO_SRC,
    apple: BOOKCHAIN_LOGO_SRC,
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
