'use client'

import Link from 'next/link'
import { routes } from '@/config/routes'
import { WalletButton } from '@/components/wallet/wallet-button'

/** 移动端顶栏：仅 logo + 钱包（主导航在底部） */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-50 md:hidden w-full border-b border-border/60 bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 flex h-12 items-center justify-between gap-3">
        <Link href={routes.home} className="flex items-center gap-2 shrink-0" aria-label="返回首页">
          <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="8" height="10" rx="1" stroke="white" strokeWidth="1.4" />
              <path d="M3.5 5h4M3.5 7h4M3.5 9h2" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M9 3.5l3 1.5-3 1.5" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-bold text-sm text-foreground tracking-tight">BookChain</span>
        </Link>
        <WalletButton />
      </div>
    </header>
  )
}
