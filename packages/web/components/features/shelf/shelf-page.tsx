'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { marketBookDetail, routes, shelfMyEscrowTrades } from '@/config/routes'
import type { MyBook } from '@/lib/types'
import { useMyBooks } from '@/lib/hooks/use-my-books'
import { useSolCnyRate } from '@/lib/hooks/use-sol-cny-rate'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchBookDetail } from '@/lib/api/book-detail'
import {
  broadcastDelistBook,
  broadcastUpdatePrice,
  buildDelistBook,
  buildUpdatePrice,
} from '@/lib/api/book-management'
import { signSerializedTxWithWallet } from '@/lib/api/book-listing'

type ShelfTab = 'published' | 'owned' | 'history'

const STATUS_CONFIG: Record<MyBook['status'], { label: string; className: string }> = {
  listed: { label: '在售中', className: 'text-primary bg-primary/10' },
  sold: { label: '已售出', className: 'text-muted-foreground bg-secondary' },
  owned: { label: '已购入', className: 'text-blue-400 bg-blue-400/10' },
}

function formatSolChainPreview(raw: string) {
  const n = Number.parseFloat(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return '—'
  return n.toFixed(9).replace(/\.?0+$/, '')
}

function ShelfBookCard({ book, type }: { book: MyBook; type: ShelfTab }) {
  const { publicKey, signTransaction } = useWallet()
  const { cnyPerSol, loading: refFxLoading } = useSolCnyRate()
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
  const [snapshotPriceCny, setSnapshotPriceCny] = useState<number | null>(
    typeof book.priceCny === 'number' && Number.isFinite(book.priceCny) && book.priceCny > 0
      ? book.priceCny
      : null,
  )
  const snapshotFx = typeof book.fxCnyPerSol === 'number' && Number.isFinite(book.fxCnyPerSol) && book.fxCnyPerSol > 0
    ? book.fxCnyPerSol
    : null

  /** 改价弹窗内人民币换算：优先实时汇率（与上架页一致），否则回退上架快照 */
  const conversionFx =
    typeof cnyPerSol === 'number' && Number.isFinite(cnyPerSol) && cnyPerSol > 0
      ? cnyPerSol
      : snapshotFx

  const detailAsset = book.assetId ?? book.id

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
    const timer = window.setTimeout(() => setCancelHintOpen(false), 2000)
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
      const detail = await fetchBookDetail(detailAsset)
      const built = await buildDelistBook({
        seller: publicKey.toBase58(),
        asset: detailAsset,
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
        asset: detailAsset,
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
        asset: detailAsset,
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
        asset: detailAsset,
        new_price: lamports,
      })
      setPriceSol(next)
      const fxForCard = conversionFx ?? snapshotFx
      if (fxForCard && Number.isFinite(fxForCard) && fxForCard > 0) {
        setSnapshotPriceCny(next * fxForCard)
      }
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
    <div className={['bg-card border border-border rounded-xl overflow-hidden flex gap-3 p-3 md:gap-4 md:p-4', delisted ? 'opacity-40' : ''].join(' ')}>
      <Link
        href={marketBookDetail(detailAsset)}
        className="relative w-14 h-20 md:w-16 md:h-[5.5rem] rounded-lg overflow-hidden shrink-0 bg-secondary block ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="查看书籍详情"
      >
        <Image src={book.cover} alt={book.title} fill className="object-cover" />
      </Link>

      {/* 信息 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={marketBookDetail(detailAsset)}
              className="block min-w-0 hover:text-primary transition-colors"
            >
              <p className="font-semibold text-sm md:text-base text-foreground truncate">{book.title}</p>
              <p className="text-xs md:text-sm text-muted-foreground">{book.author}</p>
            </Link>
          </div>
          <span className={['text-[10px] md:text-xs font-medium px-1.5 py-0.5 rounded shrink-0', status.className].join(' ')}>
            {delisted ? '已下架' : status.label}
          </span>
        </div>

        <p className="text-[11px] md:text-sm text-muted-foreground font-mono">#{book.tokenId}</p>

        <div className="flex items-center justify-between mt-auto">
          <div>
            {snapshotPriceCny != null ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-primary font-mono font-bold text-base md:text-lg">
                  ¥{snapshotPriceCny.toFixed(2)}
                </span>
                <span className="text-sm md:text-[15px] text-muted-foreground font-mono tabular-nums">
                  {priceSol} SOL
                </span>
              </div>
            ) : (
              <span className="text-primary font-mono font-bold text-base md:text-lg">{priceSol} SOL</span>
            )}
            {(cnyPerSol ?? snapshotFx) != null && (
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs md:text-sm text-muted-foreground">
                <span className="min-w-0">
                  参考汇率：1 SOL ≈ ¥
                  {(cnyPerSol ?? snapshotFx)!.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                </span>
                {cnyPerSol != null &&
                snapshotFx != null &&
                Math.abs(cnyPerSol - snapshotFx) > 0.5 ? (
                  <>
                    <span className="text-muted-foreground/35 select-none" aria-hidden>
                      ·
                    </span>
                    <span className="text-[10px] md:text-xs opacity-90">
                      上架快照 ¥{snapshotFx.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} / SOL
                    </span>
                  </>
                ) : null}
              </div>
            )}
            {type === 'published' ? (
              <p className="text-[10px] md:text-xs text-muted-foreground">上架于 {book.listedAt}</p>
            ) : (
              <p className="text-[10px] md:text-xs text-muted-foreground">
                购入于 {book.purchasedAt ?? book.listedAt}
              </p>
            )}
          </div>

          {/* 操作按钮 */}
          {type === 'published' && book.status === 'listed' && !delisted && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftPriceSol(String(priceSol))
                  if (conversionFx && Number.isFinite(conversionFx) && conversionFx > 0) {
                    setDraftPriceCny((priceSol * conversionFx).toFixed(2))
                    setPriceMode('cny')
                  } else {
                    setDraftPriceCny('')
                    setPriceMode('sol')
                  }
                  setPriceDialogOpen(true)
                }}
                disabled={updatingPrice || delisting || priceSigning || delistSigning}
                className="h-7 md:h-8 px-3 md:px-3.5 text-xs md:text-sm border-primary/40 text-primary hover:bg-primary/10 rounded-lg"
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
                className="h-7 md:h-8 px-3 md:px-3.5 text-xs md:text-sm border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg"
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
          {(type === 'owned' || type === 'history') && (
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Button asChild size="sm" variant="outline" className="h-7 md:h-8 px-2.5 md:px-3 text-xs md:text-sm border-border/70 text-foreground hover:bg-secondary rounded-lg">
                <Link href={shelfMyEscrowTrades(detailAsset)}>我的交易</Link>
              </Button>
              {type === 'owned' && book.status === 'owned' && (
                <Button asChild size="sm" variant="outline" className="h-7 md:h-8 px-2.5 md:px-3 text-xs md:text-sm border-primary/40 text-primary hover:bg-primary/10 rounded-lg">
                  <Link href={`${routes.list}?relist=1&asset=${encodeURIComponent(detailAsset)}`}>转卖</Link>
                </Button>
              )}
            </div>
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
                  if (conversionFx && Number.isFinite(n) && n > 0) {
                    const sol = n / conversionFx
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
                placeholder={conversionFx ? '例如 88.00' : '缺少汇率参考'}
                className="w-full h-10 rounded-md border border-border bg-input px-3 text-sm"
                disabled={!conversionFx}
              />
            ) : (
              <input
                value={draftPriceSol}
                onChange={(e) => {
                  const v = e.target.value
                  setDraftPriceSol(v)
                  const n = Number.parseFloat(v)
                  if (conversionFx && Number.isFinite(n) && n > 0) {
                    setDraftPriceCny((n * conversionFx).toFixed(2))
                  } else if (v.trim() === '') {
                    setDraftPriceCny('')
                  }
                }}
                placeholder="例如 0.12"
                className="w-full h-10 rounded-md border border-border bg-input px-3 text-sm"
              />
            )}
            {refFxLoading && !cnyPerSol ? (
              <p className="text-xs text-muted-foreground">正在获取实时汇率…</p>
            ) : null}
            {cnyPerSol ? (
              <p className="text-xs text-muted-foreground">
                当前参考汇率（与上架页同数据源，会刷新）：1 SOL ≈ ¥
                {cnyPerSol.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
              </p>
            ) : null}
            {snapshotFx ? (
              <p className="text-xs text-muted-foreground/90">
                本书上架时保存的汇率快照：1 SOL ≈ ¥
                {snapshotFx.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
              </p>
            ) : null}
            {!cnyPerSol && !snapshotFx ? (
              <p className="text-xs text-muted-foreground">缺少汇率参考时，仅支持按 SOL 输入。</p>
            ) : null}
            <p className="text-xs text-muted-foreground font-mono">
              链上实际提交：{formatSolChainPreview(draftPriceSol)} SOL
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
        <div className="fixed left-1/2 top-1/2 z-[90] w-[min(92vw,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-center text-sm md:text-base text-destructive shadow-md">
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
  const { published, owned, history, refetch } = useMyBooks()
  const [activeTab, setActiveTab] = useState<ShelfTab>('published')

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refetch])

  const tabRows =
    activeTab === 'published' ? published : activeTab === 'owned' ? owned : history

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
        <div className="flex border-b border-border mb-4 overflow-x-auto">
          {([
            { key: 'published' as const, label: `我发布的 (${published.length})` },
            { key: 'owned' as const, label: `我持有 (${owned.length})` },
            { key: 'history' as const, label: `历史买入 (${history.length})` },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0',
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
        {tabRows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">暂无记录</div>
        ) : (
          <div className="flex flex-col gap-3">
            {tabRows.map((book) => (
              <ShelfBookCard key={book.id} book={book} type={activeTab} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
