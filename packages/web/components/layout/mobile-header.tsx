'use client'

import Link from 'next/link'
import { routes } from '@/config/routes'
import { BookChainLogo } from '@/components/shared/bookchain-logo'
import { WalletButton } from '@/components/wallet/wallet-button'

/** 移动端顶栏：仅 logo + 钱包（主导航在底部） */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-50 md:hidden w-full border-b border-border/60 bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 flex h-12 items-center justify-between gap-3">
        <Link href={routes.home} className="shrink-0" aria-label="返回首页">
          <BookChainLogo size={24} wordmarkClassName="font-bold text-sm text-foreground tracking-tight" />
        </Link>
        <WalletButton />
      </div>
    </header>
  )
}
