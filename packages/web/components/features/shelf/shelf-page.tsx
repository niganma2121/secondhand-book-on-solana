'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { routes } from '@/config/routes'
import type { MyBook } from '@/lib/types'
import { useMyBooks } from '@/lib/hooks/use-my-books'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSolCnyRate } from '@/lib/hooks/use-sol-cny-rate'
import { fetchBookDetail } from '@/lib/api/book-detail'
import {
  broadcastDelistBook,
  broadcastUpdatePrice,
  buildDelistBook,
  buildUpdatePrice,
} from '@/lib/api/book-management'
import { signSerializedTxWithWallet } from '@/lib/api/book-listing'

type ShelfTab = 'listed' | 'purchased'

const STATUS_CONFIG: Record<MyBook['status'], { label: string; className: string }> = {
  listed: { label: '在售中', className: 'text-primary bg-primary/10' },
  sold: { label: '已售出', className: 'text-muted-foreground bg-secondary' },
  owned: { label: '已购入', className: 'text-blue-400 bg-blue-400/10' },
}

function ShelfBookCard({ book, type }: { book: MyBook; type: ShelfTab }) {
  const { publicKey, signTransaction } = useWallet()
  const [delisting, setDelisting] = useState(false)
  const [delistSigning, setDelistSigning] = useState(false)
  const [delisted, setDelisted] = useState(false)
  const [updatingPrice, setUpdatingPrice] = useState(false)
  const [priceSigning, setPriceSigning] = useState(false)
  const [priceSol, setPriceSol] = useState(book.price)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [priceMode, setPriceMode] = useState<'cny' | 'sol'>('cny')
  const [draftPriceSol, setDraftPriceSol] = useState(String(book.price))
  const [draftPriceCny, setDraftPriceCny] = useState('')
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [cancelHintOpen, setCancelHintOpen] = useState(false)
  const { cnyPerSol, loading: rateLoading } = useSolCnyRate()

  function normalizeCnyInput(raw: string): string {
    const cleaned = raw.replace(/[^\d.]/g, '')
    const firstDot = cleaned.indexOf('.')
    if (firstDot < 0) return cleaned
    const intPart = cleaned.slice(0, firstDot)
    const decRaw = cleaned.slice(firstDot + 1).replace(/\./g, '')
    return `${intPart}.${decRaw.slice(0, 2)}`
  }

  function openResult(type: 'error' | 'success', text: string) {
    setResultMsg({ type, text })
    setResultDialogOpen(true)
  }

  useEffect(() => {
    if (!cancelHintOpen) return
    const timer = window.setTimeout(() => setCancelHintOpen(false), 3000)
    return () => window.clearTimeout(timer)
  }, [cancelHintOpen])

  async function handleDelist() {
    if (!publicKey) return
    if (!signTransaction) {
      openResult('error', '当前钱包不支持交易签名')
      return
    }
    setDelisting(true)
    try {
      const detail = await fetchBookDetail(book.id)
      const built = await buildDelistBook({
        seller: publicKey.toBase58(),
        asset: book.id,
        collection: detail.book.collection,
      })
      let signedTx = ''
      try {
        setDelistSigning(true)
        signedTx = await signSerializedTxWithWallet(built.tx, signTransaction)
      } catch {
        openResult('error', '已取消操作')
        return
      } finally {
        setDelistSigning(false)
      }
      await broadcastDelistBook({
        signed_tx: signedTx,
        asset: book.id,
        seller: publicKey.toBase58(),
      })
      setDelisted(true)
      openResult('success', '广播成功')
    } catch {
      openResult('error', '广播失败')
    } finally {
      setDelisting(false)
    }
  }

  async function handleUpdatePriceSubmit() {
    if (!publicKey) return
    if (!signTransaction) {
      openResult('error', '当前钱包不支持交易签名')
      return
    }
    const next = Number(draftPriceSol.trim())
    if (!Number.isFinite(next) || next <= 0) {
      openResult('error', '请输入合法价格（大于 0）')
      return
    }
    const lamports = Math.round(next * 1_000_000_000)
    if (lamports <= 0) {
      openResult('error', '价格过小，请提高后重试')
      return
    }
    const currentLamports = Math.round(priceSol * 1_000_000_000)
    if (lamports === currentLamports) {
      openResult('error', '新价格与当前价格相同，请修改后再提交')
      return
    }
    setUpdatingPrice(true)
    try {
      const built = await buildUpdatePrice({
        seller: publicKey.toBase58(),
        asset: book.id,
        new_price: lamports,
      })
      let signedTx = ''
      try {
        setPriceSigning(true)
        signedTx = await signSerializedTxWithWallet(built.tx, signTransaction)
      } catch {
        setPriceDialogOpen(false)
        setCancelHintOpen(true)
        return
      } finally {
        setPriceSigning(false)
      }
      await broadcastUpdatePrice({
        signed_tx: signedTx,
        asset: book.id,
        new_price: lamports,
      })
      setPriceSol(next)
      setPriceDialogOpen(false)
      openResult('success', '广播成功')
    } catch {
      openResult('error', '广播失败')
    } finally {
      setUpdatingPrice(false)
    }
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
            <span className="text-primary font-mono font-bold text-sm">{priceSol} SOL</span>
            {book.purchasedAt && (
              <p className="text-[10px] text-muted-foreground">
                {type === 'listed' ? `上架于 ${book.listedAt}` : `购入于 ${book.purchasedAt}`}
              </p>
            )}
          </div>

          {/* 操作按钮 */}
          {type === 'listed' && book.status === 'listed' && !delisted && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftPriceSol(String(priceSol))
                  if (cnyPerSol && Number.isFinite(cnyPerSol) && cnyPerSol > 0) {
                    setDraftPriceCny((priceSol * cnyPerSol).toFixed(2))
                    setPriceMode('cny')
                  } else {
                    setDraftPriceCny('')
                    setPriceMode('sol')
                  }
                  setPriceDialogOpen(true)
                }}
                disabled={updatingPrice || delisting || priceSigning || delistSigning}
                className="h-7 px-3 text-xs border-primary/40 text-primary hover:bg-primary/10 rounded-lg"
              >
                {priceSigning ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    待签名
                  </span>
                ) : updatingPrice ? '改价中' : '改价'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDelist}
                disabled={delisting || updatingPrice || priceSigning || delistSigning}
                className="h-7 px-3 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg"
              >
                {delistSigning ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                    待签名
                  </span>
                ) : delisting ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                    下架中
                  </span>
                ) : '下架'}
              </Button>
            </div>
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
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-[min(92vw,420px)]">
          <DialogHeader>
            <DialogTitle>修改价格</DialogTitle>
            <DialogDescription>
              支持人民币与 SOL 两种输入，确认后进行签名。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="inline-flex rounded-lg border border-border p-1">
              <button
                type="button"
                onClick={() => setPriceMode('cny')}
                className={['px-3 py-1 text-xs rounded-md', priceMode === 'cny' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'].join(' ')}
              >
                人民币
              </button>
              <button
                type="button"
                onClick={() => setPriceMode('sol')}
                className={['px-3 py-1 text-xs rounded-md', priceMode === 'sol' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'].join(' ')}
              >
                SOL
              </button>
            </div>
            {priceMode === 'cny' ? (
              <input
                value={draftPriceCny}
                onChange={(e) => {
                  const v = normalizeCnyInput(e.target.value)
                  setDraftPriceCny(v)
                  const n = Number.parseFloat(v)
                  if (cnyPerSol && Number.isFinite(n) && n > 0) {
                    const sol = n / cnyPerSol
                    setDraftPriceSol(sol.toFixed(9).replace(/\.?0+$/, ''))
                  } else {
                    setDraftPriceSol('')
                  }
                }}
                onBlur={() => {
                  const n = Number.parseFloat(draftPriceCny)
                  if (Number.isFinite(n) && n > 0) {
                    setDraftPriceCny(n.toFixed(2))
                  }
                }}
                placeholder={rateLoading ? '正在获取汇率…' : '例如 88.00'}
                className="w-full h-10 rounded-md border border-border bg-input px-3 text-sm"
                disabled={!cnyPerSol || rateLoading}
              />
            ) : (
              <input
                value={draftPriceSol}
                onChange={(e) => {
                  const v = e.target.value
                  setDraftPriceSol(v)
                  const n = Number.parseFloat(v)
                  if (cnyPerSol && Number.isFinite(n) && n > 0) {
                    setDraftPriceCny((n * cnyPerSol).toFixed(2))
                  } else if (v.trim() === '') {
                    setDraftPriceCny('')
                  }
                }}
                placeholder="例如 0.12"
                className="w-full h-10 rounded-md border border-border bg-input px-3 text-sm"
              />
            )}
            {cnyPerSol ? (
              <p className="text-xs text-muted-foreground">
                参考汇率：1 SOL ≈ ¥{cnyPerSol.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">当前未获取到汇率，仅支持 SOL 输入。</p>
            )}
            <p className="text-xs text-muted-foreground">
              链上实际提交：{draftPriceSol || '—'} SOL
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPriceDialogOpen(false)}
                disabled={updatingPrice || priceSigning}
              >
                取消
              </Button>
              <Button onClick={handleUpdatePriceSubmit} disabled={updatingPrice || priceSigning}>
                {priceSigning ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    等待签名
                  </span>
                ) : updatingPrice ? '处理中...' : '签名确定'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {cancelHintOpen ? (
        <div className="fixed top-20 left-1/2 z-[90] -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
          已取消操作
        </div>
      ) : null}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-[min(92vw,360px)]">
          <DialogHeader>
            <DialogTitle>{resultMsg?.type === 'success' ? '操作成功' : '操作结果'}</DialogTitle>
            <DialogDescription className={resultMsg?.type === 'success' ? 'text-primary' : 'text-destructive'}>
              {resultMsg?.text ?? ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setResultDialogOpen(false)}>知道了</Button>
          </div>
        </DialogContent>
      </Dialog>
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
