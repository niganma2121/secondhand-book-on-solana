'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { routes } from '@/config/routes'
import { formatSellerDisplay } from '@/lib/format-seller'
import type { Book } from '@/lib/types'
import { useBooks } from '@/lib/hooks/use-books'
import { fetchOverviewStats, type OverviewStatsResponse } from '@/lib/api/stats'
import { Button } from '@/components/ui/button'

const EMPTY_STATS: OverviewStatsResponse = {
  books_on_sale: 0,
  chain_transactions: 0,
  registered_users: 0,
  total_volume_sol: 0,
}

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2l2.7 6L21 9l-4.5 4.5 1.2 6.5L12 17l-5.7 3 1.2-6.5L3 9l6.3-1L12 2z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    title: '链上所有权验证',
    desc: '每本书铸造为 Solana NFT，所有权记录永久上链，杜绝造假',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7V6a4 4 0 018 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: '智能合约托管',
    desc: '交易资金由合约自动托管，确认收货后自动结算，买卖双方均受保护',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: '秒级链上结算',
    desc: 'Solana TPS 高达 65000，交易确认低于 0.4 秒，Gas 费极低',
  },
]

export function HomePage() {
  const { publicKey } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const { books, loading } = useBooks()
  const [stats, setStats] = useState<OverviewStatsResponse>(EMPTY_STATS)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const heroBooks = books.slice(0, 3)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchOverviewStats()
        if (!cancelled) {
          setStats(data)
          setStatsLoaded(true)
        }
      } catch {
        if (!cancelled) setStatsLoaded(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const statsCards = useMemo(
    () => [
      {
        label: '在售书籍',
        value: statsLoaded ? stats.books_on_sale.toLocaleString('zh-CN') : '—',
        unit: '',
      },
      {
        label: '链上交易',
        value: statsLoaded ? stats.chain_transactions.toLocaleString('zh-CN') : '—',
        unit: '',
      },
      {
        label: '注册用户',
        value: statsLoaded ? stats.registered_users.toLocaleString('zh-CN') : '—',
        unit: '',
      },
      {
        label: '总交易额',
        value: statsLoaded ? stats.total_volume_sol.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—',
        unit: statsLoaded ? 'SOL' : '',
      },
    ],
    [stats, statsLoaded],
  )

  return (
    <div className="pb-28 md:pb-12">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-5 sm:px-8 pt-12 pb-14 md:pt-24 md:pb-28 max-w-7xl mx-auto">

        {/* 呼吸光晕：右上 / 左下 / 中部（错开周期，更有层次） */}
        <div
          aria-hidden="true"
          className="animate-home-hero-blob-a pointer-events-none absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.72 0.19 145 / 0.14) 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden="true"
          className="animate-home-hero-blob-b pointer-events-none absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.72 0.19 145 / 0.09) 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden="true"
          className="animate-home-hero-blob-c pointer-events-none absolute top-[36%] left-1/2 h-[min(480px,92vw)] w-[min(480px,92vw)] rounded-full blur-3xl md:top-[40%]"
          style={{
            background: 'radial-gradient(circle, oklch(0.72 0.19 145 / 0.1) 0%, transparent 68%)',
          }}
        />
        {/* 网格：轻微明度呼吸 */}
        <div
          aria-hidden="true"
          className="animate-home-hero-grid pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(oklch(0.72 0.19 145) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.19 145) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.03,
          }}
        />
        {/* 底部渐隐：随光略变，压光避免晃眼 */}
        <div
          aria-hidden="true"
          className="animate-home-hero-vignette pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background"
        />

        <div className="relative flex flex-col md:flex-row md:items-center gap-10 md:gap-16">

          {/* 文案区 */}
          <div className="flex-1 min-w-0">
            {/* 徽章 */}
            <div className="animate-home-hero-badge inline-flex items-center gap-2.5 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-medium text-primary md:px-5 md:py-2.5 md:text-sm mb-6 md:mb-8">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
              {"Solana 区块链 · 安全透明"}
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.12] tracking-tight">
              <span className="text-foreground">{"让每一本书都有"}</span>
              <br />
              <span className="text-primary">{'\xa0'}{"可追溯"}</span>
                <span className={"text-foreground"}>{"的故事"}</span>
            </h1>

            <p className="mt-5 md:mt-7 text-muted-foreground text-base md:text-lg leading-relaxed max-w-md">
              {"BookChain 是基于 Solana 的去中心化二手书交易平台。每本书铸造为 NFT，交易全程链上可查，无需信任，无需中间商。"}
            </p>

            <div className="mt-7 md:mt-9 flex flex-wrap gap-3">
              <Button asChild className="bg-primary text-primary-foreground font-semibold px-6 h-11 md:h-12 md:px-8 rounded-xl hover:opacity-90 transition-opacity text-sm md:text-base">
                <Link href={routes.market}>{"浏览书籍市场"}</Link>
              </Button>
              {!publicKey ? (
                <Button
                  variant="outline"
                  onClick={openWalletConnect}
                  className="border-border/60 text-foreground px-6 h-11 md:h-12 md:px-8 rounded-xl hover:border-primary/50 transition-colors text-sm md:text-base"
                >
                  {"连接钱包开始交易"}
                </Button>
              ) : (
                <Button asChild variant="outline" className="border-border/60 text-foreground px-6 h-11 md:h-12 md:px-8 rounded-xl hover:border-primary/50 transition-colors text-sm md:text-base">
                  <Link href={routes.list}>{"上架我的书籍"}</Link>
                </Button>
              )}
            </div>
          </div>

          {/* 书籍封面展示区 — 仅 PC，3 张：上 1 大 + 下 2 小 */}
          {!loading && heroBooks.length >= 3 && (
          <div className="animate-home-hero-books hidden shrink-0 flex-col gap-4 md:flex w-[340px] lg:w-[420px]">
            {/* 大图 */}
            <div className="relative w-full h-56 lg:h-64 rounded-2xl overflow-hidden border border-border/60 shadow-2xl">
              <Image
                src={heroBooks[0].cover}
                alt={heroBooks[0].title}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/75 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-sm font-semibold text-white truncate drop-shadow-md">{heroBooks[0].title}</p>
                <p className="text-xs text-primary font-mono mt-0.5">{heroBooks[0].price} SOL</p>
              </div>
            </div>
            {/* 下方两张小图 */}
            <div className="grid grid-cols-2 gap-4">
              {heroBooks.slice(1).map((book) => (
                <div
                  key={book.id}
                  className="relative h-36 lg:h-44 rounded-2xl overflow-hidden border border-border/60 shadow-xl"
                >
                  <Image src={book.cover} alt={book.title} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/75 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-xs font-semibold text-white truncate drop-shadow">{book.title}</p>
                    <p className="text-[11px] text-primary font-mono mt-0.5">{book.price} SOL</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

        </div>
      </section>

      {/* ── 数据统计（与 Hero 明确分区，避免 PC 上挤进上方光晕/标题区） ── */}
      <section className="relative z-10 border-t border-border/50 bg-background px-5 sm:px-8 max-w-7xl mx-auto pt-10 pb-1 md:pt-14 md:pb-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {statsCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-card border border-border/60 rounded-2xl p-4 md:p-5 flex flex-col gap-1"
            >
              <span className="text-muted-foreground text-xs md:text-sm">{stat.label}</span>
              <span className="text-2xl md:text-3xl font-bold text-foreground tabular-nums">
                {stat.value}
                {stat.unit ? (
                  <span className="ml-1 text-sm font-normal text-muted-foreground md:text-base">{stat.unit}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 核心特性 ── */}
      <section className="px-5 sm:px-8 max-w-7xl mx-auto mt-10 md:mt-14">
        <h2 className="text-lg md:text-xl font-semibold text-foreground mb-4 md:mb-6">{"为什么选择 BookChain"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-card border border-border/60 rounded-2xl p-5 md:p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors"
            >
              <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                {f.icon}
              </span>
              <div>
                <p className="font-semibold text-sm md:text-base text-foreground">{f.title}</p>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 最近上架 ── */}
      <section className="px-5 sm:px-8 max-w-7xl mx-auto mt-10 md:mt-14">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">{"最近上架"}</h2>
          <Link
            href={routes.market}
            className="text-sm text-primary hover:underline underline-offset-2"
          >
            {"查看全部"}
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
          {(loading ? [] : books.slice(0, 4)).map((book, index) => (
            <RecentBookCard key={book.id} book={book} eagerImage={index === 0} />
          ))}
        </div>
      </section>

    </div>
  )
}

function RecentBookCard({ book, eagerImage = false }: { book: Book; eagerImage?: boolean }) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-primary/30 transition-colors group">
      <div className="relative aspect-[3/4] w-full min-h-[160px] overflow-hidden">
        <Image
          src={book.cover}
          alt={book.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, 25vw"
          loading={eagerImage ? 'eager' : 'lazy'}
        />
      </div>
      <div className="p-3 md:p-4">
        <p className="text-sm md:text-base font-medium text-foreground truncate">{book.title}</p>
        <p className="text-xs md:text-sm text-muted-foreground truncate mt-0.5">{book.author}</p>
        <p
          className="text-[10px] text-muted-foreground/90 truncate mt-1"
          title={book.seller}
        >
          卖家 {formatSellerDisplay(book.seller, book.sellerUsername)}
        </p>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-primary font-mono font-semibold text-sm md:text-base">{book.price} SOL</span>
          <span className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">
            {book.condition}
          </span>
        </div>
      </div>
    </div>
  )
}
