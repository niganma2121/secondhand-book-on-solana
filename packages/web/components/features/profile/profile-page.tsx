'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { routes } from '@/config/routes'
import { env } from '@/lib/env'
import type { MyBook } from '@/lib/types'
import { useMyBooks } from '@/lib/hooks/use-my-books'
import { useAuth } from '@/components/providers/auth-provider'
import { hasStoredAccessToken } from '@/lib/auth/token-store'
import { Button } from '@/components/ui/button'

type ProfileTab = 'shelf' | 'sold'

const STATUS_LABEL: Record<MyBook['status'], { text: string; cls: string }> = {
  listed: { text: '在售', cls: 'text-primary bg-primary/10' },
  sold:   { text: '已售', cls: 'text-muted-foreground bg-secondary' },
  owned:  { text: '已购', cls: 'text-blue-400 bg-blue-400/10' },
}

function MiniBookCard({ book }: { book: MyBook }) {
  const s = STATUS_LABEL[book.status]
  return (
    <div className="flex gap-3 p-3 rounded-2xl bg-secondary/40 border border-border/50 items-center">
      <div className="relative w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-card">
        <Image src={book.cover} alt={book.title} fill className="object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{book.title}</p>
        <p className="text-xs text-muted-foreground">{book.author}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-xs text-primary font-bold">{book.price} SOL</span>
          <span className={['text-[10px] px-1.5 py-0.5 rounded font-medium', s.cls].join(' ')}>{s.text}</span>
        </div>
      </div>
      {book.status === 'listed' && (
        <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 rounded-xl" asChild>
          <Link href={routes.shelf}>管理</Link>
        </Button>
      )}
    </div>
  )
}

export function ProfilePage() {
  const { publicKey, disconnect } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [profileTab, setProfileTab] = useState<ProfileTab>('shelf')
  const {
    user,
    sessionStatus,
    isAuthenticated,
    refreshSession,
    authLoading,
  } = useAuth()

  const addr = publicKey ? publicKey.toBase58() : ''
  const short = addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : ''

  const { books: myBooks } = useMyBooks()

  const shelfBooks = myBooks.filter((b) => b.status === 'listed' || b.status === 'sold')
  const boughtBooks = myBooks.filter((b) => b.status === 'owned')

  const displayName =
    isAuthenticated && user?.username ? user.username : '匿名用户'

  const stats: { label: string; value: number | string }[] = [
    { label: '上架书籍', value: shelfBooks.filter((b) => b.status === 'listed').length },
    {
      label: '历史交易',
      value: isAuthenticated && user ? user.trade_count : '—',
    },
    { label: '已购书籍', value: boughtBooks.length },
    { label: '累计收益', value: '—' },
  ]

  const apiConfigured = !env.useMockData && Boolean(env.apiBaseUrl)
  const walletMatchesBackend =
    isAuthenticated && user && addr && user.pubkey === addr

  // 未连接钱包
  if (!publicKey) {
    return (
      <div className="pb-24 md:pb-10 min-h-[60vh] flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-20 h-20 rounded-3xl bg-card border border-border/60 flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="text-muted-foreground">
            <circle cx="18" cy="13" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5 32c0-7.18 5.82-13 13-13s13 5.82 13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-foreground">连接钱包</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            连接 Phantom 或 Solflare 钱包<br />查看你的链上书架与交易记录
          </p>
        </div>
        <Button
          onClick={openWalletConnect}
          className="bg-primary text-primary-foreground h-11 px-8 rounded-xl font-semibold"
        >
          连接钱包
        </Button>
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-5">

        {!apiConfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 leading-relaxed">
            连接后端认证：在 <span className="font-mono">.env.local</span> 设置{' '}
            <span className="font-mono">NEXT_PUBLIC_API_URL</span>（如{' '}
            <span className="font-mono">http://127.0.0.1:3005/api</span>）与{' '}
            <span className="font-mono">NEXT_PUBLIC_USE_MOCK_DATA=false</span>
            ，刷新页面后会再次请求 <span className="font-mono">GET /auth/getme</span>{' '}
            恢复会话。
          </div>
        )}

        {/* 用户信息卡 */}
        <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
          {/* 顶部渐变条 */}
          <div className="h-16 bg-primary/10 relative">
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 145 / 0.15), oklch(0.72 0.19 145 / 0.05))' }}
            />
          </div>
          {/* 头像 + 信息 */}
          <div className="px-4 pb-4 -mt-8 flex items-end gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 border-2 border-card flex items-center justify-center shrink-0">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-primary">
                <circle cx="14" cy="10" r="5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 26c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <p className="font-bold text-foreground text-base">{displayName}</p>
              <button
                onClick={() => navigator.clipboard?.writeText(addr)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                aria-label="复制钱包地址"
              >
                <span className="font-mono">{short}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1.5 8.5V2a.5.5 0 01.5-.5h6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Devnet
              </span>
            </div>
            {/* 断开钱包 */}
            <button
              onClick={() => disconnect()}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors pb-1"
              aria-label="断开钱包连接"
            >
              断开
            </button>
          </div>

          {/* 后端会话（getMe）：刷新页面后仍显示「已登录」依赖此处重新拉取 */}
          {apiConfigured && (
            <div className="mx-4 mb-4 p-3 rounded-xl bg-secondary/30 border border-border/50 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">后端会话</span>
                <span className="text-muted-foreground">
                  {sessionStatus === 'loading'
                    ? '校验中…'
                    : isAuthenticated
                      ? '已通过 GET /auth/getme'
                      : '未登录后端'}
                </span>
              </div>
              {isAuthenticated && user && (
                <>
                  <p className="font-mono text-[11px] text-muted-foreground break-all">
                    账户 pubkey：{user.pubkey.slice(0, 8)}…{user.pubkey.slice(-8)}
                  </p>
                  <p className="text-muted-foreground">
                    交易 {user.trade_count} · 售出 {user.sell_count} · 购入{' '}
                    {user.buy_count}
                  </p>
                  {walletMatchesBackend && (
                    <p className="text-primary">与当前钱包地址一致</p>
                  )}
                  {addr && user.pubkey !== addr && (
                    <p className="text-amber-500">
                      提示：后端账户与当前连接钱包不一致，请用登录时的钱包或重新签名登录。
                    </p>
                  )}
                </>
              )}
              {!isAuthenticated &&
                sessionStatus !== 'loading' &&
                hasStoredAccessToken() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={authLoading}
                    onClick={() => refreshSession()}
                  >
                    {authLoading ? '重试中…' : '重新验证会话'}
                  </Button>
                )}
            </div>
          )}

          {/* 数据统计 */}
          <div className="grid grid-cols-4 divide-x divide-border/50 border-t border-border/50">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center py-3 gap-0.5">
                <span className="font-bold text-sm text-foreground">{s.value}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ),
              label: '上架书籍',
              desc: '铸造 NFT',
              href: routes.list,
              accent: true,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="2" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 6V4a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ),
              label: '逛书市',
              desc: '发现好书',
              href: routes.market,
              accent: false,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 4A2 2 0 014.5 2h11A2 2 0 0117.5 4v7a2 2 0 01-2 2H11l-3.5 3V13H4.5a2 2 0 01-2-2V4z"
                    stroke="currentColor" strokeWidth="1.5"
                  />
                  <path d="M6.5 7h7M6.5 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ),
              label: '聊天',
              desc: '与卖家沟通',
              href: routes.chat,
              accent: false,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-150 active:scale-95',
                item.accent
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-card border-border/60 text-foreground hover:border-primary/30',
              ].join(' ')}
            >
              {item.icon}
              <div className="text-center">
                <p className="text-xs font-semibold leading-tight">{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* 书架 Tab */}
        <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
          {/* Tab 头 */}
          <div className="flex border-b border-border/60">
            {([
              { key: 'shelf' as ProfileTab, label: `我上架的 (${shelfBooks.length})` },
              { key: 'sold'  as ProfileTab, label: `我买到的 (${boughtBooks.length})` },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setProfileTab(t.key)}
                className={[
                  'flex-1 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  profileTab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 书籍列表 */}
          <div className="p-3 flex flex-col gap-2.5">
            {(profileTab === 'shelf' ? shelfBooks : boughtBooks).length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">暂无记录</p>
            ) : (
              (profileTab === 'shelf' ? shelfBooks : boughtBooks).map((book) => (
                <MiniBookCard key={book.id} book={book} />
              ))
            )}
          </div>

          {/* 查看全部 */}
          <Link
            href={routes.transactions}
            className="w-full py-3 border-t border-border/60 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
          >
            查看全部链上交易记录
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {/* 设置区 */}
        <div className="rounded-2xl bg-card border border-border/60 overflow-hidden divide-y divide-border/50">
          {[
            { label: '通知设置', icon: '🔔', desc: '管理消息推送' },
            { label: '安全设置', icon: '🔒', desc: '账户与隐私' },
            { label: '帮助与反馈', icon: '💬', desc: '联系支持团队' },
            { label: '关于 BookChain', icon: '📖', desc: '版本 0.1.0 · Solana Devnet' },
          ].map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40 transition-colors text-left"
            >
              <span className="text-base" role="img" aria-label={item.label}>{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.desc}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-muted-foreground shrink-0">
                <path d="M5 3.5L8.5 7 5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        {/* 断开连接 */}
        <button
          onClick={() => disconnect()}
          className="w-full py-3.5 rounded-2xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-colors"
        >
          断开钱包连接
        </button>

      </div>
    </div>
  )
}
