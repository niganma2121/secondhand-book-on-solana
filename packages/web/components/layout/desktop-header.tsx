'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { desktopNavItems } from '@/config/navigation'
import { routes } from '@/config/routes'
import { isNavActive } from '@/lib/match-route'
import { BookChainLogo } from '@/components/shared/bookchain-logo'
import { WalletButton } from '@/components/wallet/wallet-button'
import { useChatConversationsContext } from '@/components/providers/chat-conversations-provider'
import { useOrderAttention } from '@/components/providers/order-attention-provider'

export function DesktopHeader() {
  const pathname = usePathname()
  const { conversations } = useChatConversationsContext()
  const { orderAttentionDot } = useOrderAttention()
  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0)

  return (
    <header className="sticky top-0 z-50 hidden md:block w-full border-b border-border/60 bg-card/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between gap-4">
        <Link href={routes.home} className="shrink-0" aria-label="返回首页">
          <BookChainLogo size={28} wordmarkClassName="font-bold text-base text-foreground tracking-tight" />
        </Link>

        <nav className="flex items-center gap-0.5 flex-1 justify-center max-w-2xl" aria-label="主导航">
          {desktopNavItems.map((item) => {
            const active = isNavActive(pathname, item.href)
            const msgBadge =
              item.href === routes.chat && unreadTotal > 0
                ? unreadTotal > 99
                  ? '99+'
                  : String(unreadTotal)
                : null
            const orderDot = item.href === routes.pending && orderAttentionDot
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                ].join(' ')}
              >
                <span>{item.label}</span>
                {msgBadge ? (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center leading-none">
                    {msgBadge}
                  </span>
                ) : null}
                {orderDot ? (
                  <span
                    className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive"
                    aria-hidden
                  />
                ) : null}
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
