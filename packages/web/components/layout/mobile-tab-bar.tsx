'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { mobileNavItems } from '@/config/navigation'
import { routes } from '@/config/routes'
import { isNavActive } from '@/lib/match-route'
import { unreadTotalFromFixture } from '@/mocks/fixtures/chat-conversations'

function NavCenterIcon() {
  return (
    <span className="w-13 h-13 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40 -mt-6">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M3 10.5L11 3l8 7.5V19a1 1 0 01-1 1H4a1 1 0 01-1-1v-8.5z"
        stroke="currentColor" strokeWidth="1.5"
        fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.18 : 0}
      />
      <path d="M8.5 20V14.5h5V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MarketIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2.5" y="8" width="17" height="12" rx="1.5"
        stroke="currentColor" strokeWidth="1.5"
        fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}
      />
      <path d="M7 8V6a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 13.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function TransactionsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="16" height="16" rx="2"
        stroke="currentColor" strokeWidth="1.5"
        fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0}
      />
      <path d="M7 8h8M7 11.5h5M7 15h6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="8" r="3.5"
        stroke="currentColor" strokeWidth="1.5"
        fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.18 : 0}
      />
      <path
        d="M3.5 19c0-4.142 3.358-7.5 7.5-7.5s7.5 3.358 7.5 7.5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  )
}

function iconFor(key: string, active: boolean, isCenter?: boolean) {
  if (isCenter) return <NavCenterIcon />
  switch (key) {
    case 'home':
      return <HomeIcon active={active} />
    case 'market':
      return <MarketIcon active={active} />
    case 'transactions':
      return <TransactionsIcon active={active} />
    case 'profile':
      return <ProfileIcon active={active} />
    default:
      return null
  }
}

export function MobileTabBar() {
  const pathname = usePathname()
  const [peekMode, setPeekMode] = useState(false)
  const touchStartX = useRef(0)

  const onChatRoute = pathname === routes.chat || pathname.startsWith(`${routes.chat}/`)
  const onListRoute = pathname === routes.list || pathname.startsWith(`${routes.list}/`)
  const onHomeRoute = pathname === routes.home

  useEffect(() => {
    if (onHomeRoute) setPeekMode(false)
  }, [onHomeRoute])

  const showChatBubble = !onChatRoute && !onListRoute
  const canPeek = !onHomeRoute
  const unreadCount = unreadTotalFromFixture()

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!canPeek) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx > 40) setPeekMode(true)
    if (dx < -40) setPeekMode(false)
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden" aria-label="主导航">
        <div className="bg-card/95 backdrop-blur-xl border-t border-border/60">
          <div
            className="flex items-center justify-around px-1 pt-2"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {mobileNavItems.map((item) => {
              const active = isNavActive(pathname, item.href)
              const isCenter = 'isCenter' in item && item.isCenter
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex flex-col items-center gap-0.5 flex-1 py-0.5 transition-all duration-200',
                    !isCenter && active ? 'text-primary' : 'text-muted-foreground',
                    !isCenter ? 'hover:text-foreground active:scale-95' : '',
                  ].join(' ')}
                >
                  {iconFor(item.navKey, active, Boolean(isCenter))}
                  {!isCenter && (
                    <span
                      className={[
                        'text-[10px] font-medium tracking-wide leading-none',
                        active ? 'text-primary' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {showChatBubble && (
        <div
          className="fixed right-0 z-40 md:hidden transition-transform duration-300 ease-in-out"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            transform: peekMode ? 'translateX(calc(100% - 14px))' : 'translateX(0)',
          }}
        >
          {peekMode ? (
            <div
              role="button"
              tabIndex={0}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={() => setPeekMode(false)}
              onKeyDown={(e) => e.key === 'Enter' && setPeekMode(false)}
              aria-label="展开消息"
              className="w-14 h-14 rounded-l-2xl bg-card border border-r-0 border-border/80 shadow-lg shadow-black/30 flex items-center justify-center relative cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="text-primary">
                <path
                  d="M3 5.5A2.5 2.5 0 015.5 3h11A2.5 2.5 0 0119 5.5v8A2.5 2.5 0 0116.5 16H12l-4 3v-3H5.5A2.5 2.5 0 013 13.5v-8z"
                  stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15"
                />
                <path d="M7 8h8M7 11.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-[9px] font-bold text-primary-foreground leading-none">{unreadCount}</span>
                </span>
              )}
            </div>
          ) : (
            <div className="relative mr-4" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              <Link
                href={routes.chat}
                aria-label="打开消息"
                className="w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/40 flex items-center justify-center active:scale-95 transition-transform duration-150"
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path
                    d="M3 5.5A2.5 2.5 0 015.5 3h11A2.5 2.5 0 0119 5.5v8A2.5 2.5 0 0116.5 16H12l-4 3v-3H5.5A2.5 2.5 0 013 13.5v-8z"
                    fill="white" stroke="white" strokeWidth="0.5"
                  />
                  <path d="M7 8h8M7 11.5h5" strokeWidth="1.4" strokeLinecap="round" stroke="rgba(0,0,0,0.55)" />
                </svg>
              </Link>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive border-2 border-background flex items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold text-white leading-none">{unreadCount}</span>
                </span>
              )}
              {canPeek && (
                <p className="absolute -bottom-5 right-0 text-[9px] text-muted-foreground whitespace-nowrap select-none">
                  右滑收起
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
