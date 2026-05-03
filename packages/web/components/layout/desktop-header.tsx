'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { desktopNavItems } from '@/config/navigation'
import { routes } from '@/config/routes'
import { isNavActive } from '@/lib/match-route'
import { WalletButton } from '@/components/wallet/wallet-button'

export function DesktopHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 hidden md:block w-full border-b border-border/60 bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between gap-4">
        <Link href={routes.home} className="flex items-center gap-2 shrink-0" aria-label="返回首页">
          <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="8" height="10" rx="1" stroke="white" strokeWidth="1.4" />
              <path d="M3.5 5h4M3.5 7h4M3.5 9h2" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M9 3.5l3 1.5-3 1.5" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-bold text-base text-foreground tracking-tight">BookChain</span>
        </Link>

        <nav className="flex items-center gap-0.5 flex-1 justify-center max-w-2xl" aria-label="主导航">
          {desktopNavItems.map((item) => {
            const active = isNavActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                ].join(' ')}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="shrink-0">
          <WalletButton />
        </div>
      </div>
    </header>
  )
}
