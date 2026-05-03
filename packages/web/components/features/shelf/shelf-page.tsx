'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { routes } from '@/config/routes'
import type { MyBook } from '@/lib/types'
import { useMyBooks } from '@/lib/hooks/use-my-books'
import { Button } from '@/components/ui/button'

type ShelfTab = 'listed' | 'purchased'

const STATUS_CONFIG: Record<MyBook['status'], { label: string; className: string }> = {
  listed: { label: '在售中', className: 'text-primary bg-primary/10' },
  sold: { label: '已售出', className: 'text-muted-foreground bg-secondary' },
  owned: { label: '已购入', className: 'text-blue-400 bg-blue-400/10' },
}

function ShelfBookCard({ book, type }: { book: MyBook; type: ShelfTab }) {
  const [delisting, setDelisting] = useState(false)
  const [delisted, setDelisted] = useState(false)

  async function handleDelist() {
    setDelisting(true)
    await new Promise((r) => setTimeout(r, 1500))
    setDelisted(true)
    setDelisting(false)
  }

  const status = STATUS_CONFIG[book.status]

  return (
    <div className={['bg-card border border-border rounded-xl overflow-hidden flex gap-3 p-3', delisted ? 'opacity-40' : ''].join(' ')}>
      {/* 封面 */}
      <div className="relative w-14 h-20 rounded-lg overflow-hidden shrink-0 bg-secondary">
        <Image src={book.cover} alt={book.title} fill className="object-cover" />
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{book.title}</p>
            <p className="text-xs text-muted-foreground">{book.author}</p>
          </div>
          <span className={['text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', status.className].join(' ')}>
            {delisted ? '已下架' : status.label}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground font-mono">#{book.tokenId}</p>

        <div className="flex items-center justify-between mt-auto">
          <div>
            <span className="text-primary font-mono font-bold text-sm">{book.price} SOL</span>
            {book.purchasedAt && (
              <p className="text-[10px] text-muted-foreground">
                {type === 'listed' ? `上架于 ${book.listedAt}` : `购入于 ${book.purchasedAt}`}
              </p>
            )}
          </div>

          {/* 操作按钮 */}
          {type === 'listed' && book.status === 'listed' && !delisted && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelist}
              disabled={delisting}
              className="h-7 px-3 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg"
            >
              {delisting ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                  下架中
                </span>
              ) : '下架'}
            </Button>
          )}
          {type === 'purchased' && book.status === 'owned' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs border-primary/40 text-primary hover:bg-primary/10 rounded-lg"
            >
              转卖
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ShelfPage() {
  const { publicKey } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const { books: myBooks } = useMyBooks()
  const [activeTab, setActiveTab] = useState<ShelfTab>('listed')

  const listed = myBooks.filter((b) => b.status === 'listed' || b.status === 'sold')
  const purchased = myBooks.filter((b) => b.status === 'owned' || b.status === 'sold')

  if (!publicKey) {
    return (
      <div className="pb-24 md:pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="4" y="4" width="8" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
                <rect x="13" y="7" width="6" height="17" rx="1.5" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
                <rect x="20" y="6" width="4" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">请先连接钱包</p>
              <p className="text-sm text-muted-foreground mt-1">连接 Phantom 或 Solflare 查看你的链上书架</p>
            </div>
            <Button
              onClick={openWalletConnect}
              className="bg-primary text-primary-foreground px-6 h-10 rounded-lg"
            >
              连接钱包
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* 标题 + 上架按钮 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">我的书架</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {publicKey.toBase58().slice(0, 8)}...
            </p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground h-9 px-4 text-sm rounded-lg hover:opacity-90">
            <Link href={routes.list}>+ 上架书籍</Link>
          </Button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-border mb-4">
          {([
            { key: 'listed', label: `我上架的 (${listed.length})` },
            { key: 'purchased', label: `我买到的 (${purchased.length})` },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 书籍列表 */}
        {(activeTab === 'listed' ? listed : purchased).length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">暂无记录</div>
        ) : (
          <div className="flex flex-col gap-3">
            {(activeTab === 'listed' ? listed : purchased).map((book) => (
              <ShelfBookCard key={book.id} book={book} type={activeTab} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
