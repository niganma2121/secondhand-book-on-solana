'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import type { Book } from '@/lib/types'
import { useBookCategories } from '@/lib/hooks/use-book-categories'
import { useBookConditions } from '@/lib/hooks/use-book-conditions'
import { useMarketBooks } from '@/lib/hooks/use-market-books'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { chatWithPeer } from '@/config/routes'

const SORT_OPTIONS = [
  { label: '最新上架', value: 'newest' as const },
  { label: '价格从低到高', value: 'price_asc' as const },
  { label: '价格从高到低', value: 'price_desc' as const },
  { label: '收藏最多', value: 'favorites' as const },
]

interface BuyModalProps {
  book: Book
  onClose: () => void
}

function BuyModal({ book, onClose }: BuyModalProps) {
  const { publicKey } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [step, setStep] = useState<'confirm' | 'signing' | 'done'>('confirm')

  async function handleBuy() {
    if (!publicKey) { openWalletConnect(); onClose(); return }
    setStep('signing')
    // 模拟链上交互延迟
    await new Promise((r) => setTimeout(r, 2000))
    setStep('done')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'done' ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <span className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M6 14l6 6 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
              </svg>
            </span>
            <p className="font-semibold text-foreground">购买成功！</p>
            <p className="text-xs text-muted-foreground text-center">NFT 所有权已转移至你的钱包，链上确认约需 0.4 秒</p>
            <Button onClick={onClose} className="w-full bg-primary text-primary-foreground rounded-lg">关闭</Button>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-base text-foreground mb-4">确认购买</h3>
            <div className="flex gap-3 mb-5">
              <div className="relative w-16 h-20 rounded-lg overflow-hidden shrink-0">
                <Image src={book.cover} alt={book.title} fill className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{book.title}</p>
                <p className="text-xs text-muted-foreground">{book.author}</p>
                <p className="text-xs text-muted-foreground mt-1">Token ID: {book.tokenId}</p>
                <p className="text-xs text-muted-foreground">品相: {book.condition}</p>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>书籍价格</span>
                <span className="text-foreground font-mono">{book.price} SOL</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>平台手续费 (2.5%)</span>
                <span className="text-foreground font-mono">{(book.price * 0.025).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>链上 Gas</span>
                <span className="text-foreground font-mono">~0.000005 SOL</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                <span className="text-foreground">合计</span>
                <span className="text-primary font-mono">{(book.price * 1.025).toFixed(4)} SOL</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 border-border text-foreground rounded-lg"
                disabled={step === 'signing'}
              >
                取消
              </Button>
              <Button
                onClick={handleBuy}
                className="flex-1 bg-primary text-primary-foreground rounded-lg"
                disabled={step === 'signing'}
              >
                {step === 'signing' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    签名中...
                  </span>
                ) : (
                  '确认购买'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BookCard({ book, onBuy }: { book: Book; onBuy: (book: Book) => void }) {
  const [favorited, setFavorited] = useState(false)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group flex flex-col">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-secondary">
        <Image
          src={book.cover}
          alt={book.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* 收藏按钮 */}
        <button
          onClick={() => setFavorited((v) => !v)}
          aria-label={favorited ? '取消收藏' : '收藏'}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/70 backdrop-blur flex items-center justify-center hover:bg-background/90 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 12s-6-3.5-6-7.5A3.5 3.5 0 017 3a3.5 3.5 0 016 1.5C13 8.5 7 12 7 12z"
              stroke={favorited ? '#4ade80' : 'currentColor'}
              fill={favorited ? '#4ade80' : 'none'}
              strokeWidth="1.3"
              className={favorited ? '' : 'text-muted-foreground'}
            />
          </svg>
        </button>
        {/* 品相标签 */}
        <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-background/80 text-foreground backdrop-blur">
          {book.condition}
        </span>
      </div>

      <div className="p-3 flex flex-col flex-1 gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{book.title}</p>
          <p className="text-xs text-muted-foreground truncate">{book.author}</p>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono truncate">#{book.tokenId}</p>
        <Link
          href={chatWithPeer(book.seller)}
          className="text-[10px] text-primary hover:underline truncate block"
        >
          联系卖家
        </Link>
        <div className="flex items-center justify-between mt-auto pt-1 gap-2">
          <span className="text-primary font-mono font-bold text-sm">{book.price} SOL</span>
          <Button
            size="sm"
            onClick={() => onBuy(book)}
            className="h-7 px-3 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 shrink-0"
          >
            购买
          </Button>
        </div>
      </div>
    </div>
  )
}

export function MarketPage() {
  const {
    categories: apiCategories,
    loading: categoriesLoading,
    error: categoriesError,
  } = useBookCategories()
  const {
    conditions: apiConditions,
    loading: conditionsLoading,
    error: conditionsError,
  } = useBookConditions()

  const categoryOptions = useMemo(
    () =>
      apiCategories
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ key: c.key, label: c.label })),
    [apiCategories],
  )

  const filtersLoading = categoriesLoading || conditionsLoading

  const [search, setSearch] = useState('')
  /** 与 `books.category` 一致：null = 全部分类 */
  const [categoryKey, setCategoryKey] = useState<string | null>(null)
  /** 数据库品相字段；null = 不限 */
  const [conditionDb, setConditionDb] = useState<string | null>(null)
  const [sort, setSort] =
    useState<(typeof SORT_OPTIONS)[number]['value']>('newest')
  const [buyingBook, setBuyingBook] = useState<Book | null>(null)

  const { books: filtered, loading } = useMarketBooks({
    keyword: search,
    categoryKey,
    conditionDb,
    sortBy: sort,
  })

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* 页面标题 */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">书籍市场</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {filtered.length} 本书籍在售</p>
        </div>

        {/* 搜索 */}
        <div className="relative mb-4">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="搜索书名、作者..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-10 rounded-lg bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        {(categoriesError || conditionsError) && (
          <div className="text-xs text-destructive mb-3 space-y-1">
            {categoriesError && <p>{categoriesError}</p>}
            {conditionsError && <p>{conditionsError}</p>}
          </div>
        )}

        {/* 分类 / 品相选项来自 `GET /books/categories`、`GET /books/conditions` */}
        {filtersLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载筛选项…
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                type="button"
                onClick={() => setCategoryKey(null)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  categoryKey === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
                ].join(' ')}
              >
                全部
              </button>
              {categoryOptions.map((cat) => (
                <button
                  type="button"
                  key={cat.key}
                  onClick={() => setCategoryKey(cat.key)}
                  className={[
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    categoryKey === cat.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
                  ].join(' ')}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {categoryOptions.length === 0 && (
              <p className="text-xs text-muted-foreground mb-4">
                暂无分类数据。请确认已执行数据库迁移且 `book_categories` 表有记录。
              </p>
            )}
          </>
        )}

        {/* 品相 + 排序筛选 */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <select
            value={conditionDb ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setConditionDb(v === '' ? null : v)
            }}
            disabled={filtersLoading || apiConditions.length === 0}
            className="h-8 px-2 rounded-lg bg-input border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:opacity-50"
          >
            <option value="">不限</option>
            {apiConditions
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
          </select>
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as (typeof SORT_OPTIONS)[number]['value'])
            }
            className="h-8 px-2 rounded-lg bg-input border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* 书籍网格：移动端 2 列，sm 3 列，lg 4 列 */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            未找到相关书籍
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((book) => (
              <BookCard key={book.id} book={book} onBuy={setBuyingBook} />
            ))}
          </div>
        )}
      </div>

      {/* 购买弹窗 */}
      {buyingBook && (
        <BuyModal book={buyingBook} onClose={() => setBuyingBook(null)} />
      )}
    </div>
  )
}
