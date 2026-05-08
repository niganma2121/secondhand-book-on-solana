'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { type EscrowOrder, fetchMyBuyingOrders, fetchMySellingOrders } from '@/lib/api/orders'
import {
  broadcastCancelEscrow,
  broadcastConfirmEscrow,
  broadcastOpenDispute,
  broadcastShipEscrow,
  buildCancelEscrow,
  buildConfirmEscrow,
  buildOpenDispute,
  buildShipEscrow,
  signEscrowTxWithWallet,
} from '@/lib/api/escrow'
import { fetchBookDetail } from '@/lib/api/book-detail'
import { shortenPubkey } from '@/lib/format-seller'
import { useWallet } from '@solana/wallet-adapter-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type PendingTab = 'all' | 'to_ship' | 'to_receive' | 'disputed' | 'completed' | 'cancelled'
type Role = 'buyer' | 'seller'

type PendingOrder = EscrowOrder & {
  role: Role
  bookName?: string
  bookCover?: string | null
  priceCny?: number | null
}

const TAB_OPTIONS: { key: PendingTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'to_ship', label: '待发货' },
  { key: 'to_receive', label: '待收货' },
  { key: 'disputed', label: '仲裁中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

function formatOrderTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function mapStateLabel(state: string, role: Role, cancelledBy?: string | null, currentPubkey?: string) {
  switch (state) {
    case 'Paid':
      return role === 'seller' ? '待发货' : '待卖家发货'
    case 'Shipped':
      return role === 'seller' ? '已发货' : '待收货'
    case 'Released':
      return '已完成'
    case 'Cancelled':
      if (cancelledBy && currentPubkey) {
        return cancelledBy === currentPubkey ? '已取消' : '对方已取消'
      }
      return '已取消'
    case 'Disputed':
      return '仲裁中'
    default:
      return state
  }
}

function stateClass(state: string) {
  if (state === 'Disputed') return 'text-destructive bg-destructive/10'
  if (state === 'Shipped') return 'text-primary bg-primary/10'
  if (state === 'Paid') return 'text-yellow-400 bg-yellow-400/10'
  return 'text-muted-foreground bg-secondary'
}

function lamportsToSol(lamports: number) {
  return lamports / 1_000_000_000
}

type NoticeTone = 'info' | 'error'

function formatActionErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const normalized = raw.toLowerCase()
  if (
    normalized.includes('user rejected') ||
    normalized.includes('rejected') ||
    normalized.includes('declined') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('signal timed out') ||
    normalized.includes('disconnected port')
  ) {
    return '你已取消钱包签名，本次操作未提交。'
  }
  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('blockhash not found') ||
    normalized.includes('rpc')
  ) {
    return '链上网络繁忙或连接异常，请稍后重试。'
  }
  if (raw.trim()) return raw.trim()
  return '操作失败，请稍后重试。'
}

function isUserCancelledAction(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const normalized = raw.toLowerCase()
  return (
    normalized.includes('user rejected') ||
    normalized.includes('rejected') ||
    normalized.includes('declined') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('signal timed out') ||
    normalized.includes('disconnected port')
  )
}

export function PendingPage() {
  const { isAuthenticated, sessionStatus } = useAuth()
  const { publicKey, signTransaction } = useWallet()
  const [tab, setTab] = useState<PendingTab>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [shipDialogOrder, setShipDialogOrder] = useState<PendingOrder | null>(null)
  const [shipTrackingNo, setShipTrackingNo] = useState('')
  const [shipConfirmOpen, setShipConfirmOpen] = useState(false)
  const [shipTrackingError, setShipTrackingError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null)

  function notify(message: string, tone: NoticeTone = 'info') {
    setNotice({ message, tone })
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function loadOrders() {
    const [buyingRes, sellingRes] = await Promise.all([
      fetchMyBuyingOrders(),
      fetchMySellingOrders(),
    ])
    const buying = buyingRes.orders.map((o) => ({ ...o, role: 'buyer' as const }))
    const selling = sellingRes.orders.map((o) => ({ ...o, role: 'seller' as const }))
    const merged = [...buying, ...selling].sort((a, b) => b.updated_at - a.updated_at)

    const uniqueAssets = Array.from(new Set(merged.map((o) => o.asset)))
    const detailEntries = await Promise.all(
      uniqueAssets.map(async (asset) => {
        try {
          const detail = await fetchBookDetail(asset)
          return [asset, detail.book] as const
        } catch {
          return [asset, null] as const
        }
      }),
    )
    const detailMap = new Map(detailEntries)
    const withBookInfo: PendingOrder[] = merged.map((order) => {
      const detail = detailMap.get(order.asset)
      return {
        ...order,
        bookName: detail?.name,
        bookCover: detail?.cover_url ?? null,
        priceCny: detail?.price_cny ?? null,
      }
    })
    setOrders(withBookInfo)
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setOrders([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        await loadOrders()
        if (cancelled) return
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载待处理订单失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  async function createShipCommitment(label: string) {
    const bytes = new TextEncoder().encode(label)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
  }

  async function requireWalletReady() {
    if (!publicKey) throw new Error('请先连接钱包')
    if (!signTransaction) throw new Error('当前钱包不支持签名，请切换钱包后重试')
    return { pubkey: publicKey.toBase58(), signTransaction }
  }

  async function handleShip(order: PendingOrder, trackingNoInput: string) {
    const { signTransaction } = await requireWalletReady()
    const trackingNo = trackingNoInput.trim()
    if (!trackingNo) throw new Error('请填写物流单号')
    const commitment = await createShipCommitment(trackingNo)
    const built = await buildShipEscrow({
      seller: order.seller,
      buyer: order.buyer,
      asset: order.asset,
      shipping_commitment: commitment,
    })
    const signedTx = await signEscrowTxWithWallet(built.tx, signTransaction)
    await broadcastShipEscrow({
      signed_tx: signedTx,
      escrow_pda: order.escrow_pda,
      shipping_commitment: commitment,
    })
  }

  function normalizeTrackingNo(raw: string) {
    return raw.trim().toUpperCase()
  }

  function validateTrackingNo(raw: string) {
    const normalized = normalizeTrackingNo(raw)
    if (!normalized) return '请填写物流单号'
    if (!/^[A-Z0-9-]+$/.test(normalized)) return '物流单号仅支持字母、数字和 -'
    if (normalized.length < 8 || normalized.length > 30) return '物流单号长度需在 8 到 30 位之间'
    if (/^(?:0+|1+|123456|12345678|TEST|TEST123|ABCDEFGH)$/.test(normalized)) {
      return '物流单号格式异常，请填写真实单号'
    }
    return null
  }

  async function handleConfirm(order: PendingOrder) {
    const { signTransaction } = await requireWalletReady()
    const detail = await fetchBookDetail(order.asset)
    const built = await buildConfirmEscrow({
      buyer: order.buyer,
      seller: order.seller,
      asset: order.asset,
      collection: detail.book.collection,
    })
    const signedTx = await signEscrowTxWithWallet(built.tx, signTransaction)
    await broadcastConfirmEscrow({
      signed_tx: signedTx,
      escrow_pda: order.escrow_pda,
      asset: order.asset,
      seller: order.seller,
      buyer: order.buyer,
    })
  }

  async function handleCancel(order: PendingOrder) {
    const { pubkey, signTransaction } = await requireWalletReady()
    const detail = await fetchBookDetail(order.asset)
    const built = await buildCancelEscrow({
      signer: pubkey,
      buyer: order.buyer,
      seller: order.seller,
      asset: order.asset,
      collection: detail.book.collection,
    })
    const signedTx = await signEscrowTxWithWallet(built.tx, signTransaction)
    await broadcastCancelEscrow({
      signed_tx: signedTx,
      escrow_pda: order.escrow_pda,
      asset: order.asset,
    })
  }

  async function handleDispute(order: PendingOrder) {
    const { pubkey, signTransaction } = await requireWalletReady()
    const built = await buildOpenDispute({
      signer: pubkey,
      buyer: order.buyer,
      seller: order.seller,
      asset: order.asset,
    })
    const signedTx = await signEscrowTxWithWallet(built.tx, signTransaction)
    await broadcastOpenDispute({
      signed_tx: signedTx,
      escrow_pda: order.escrow_pda,
    })
  }

  async function runOrderAction(order: PendingOrder, action: 'ship' | 'confirm' | 'cancel' | 'dispute') {
    setSubmittingId(`${order.escrow_pda}:${action}`)
    try {
      if (action === 'ship') await handleShip(order, shipTrackingNo)
      if (action === 'confirm') await handleConfirm(order)
      if (action === 'cancel') await handleCancel(order)
      if (action === 'dispute') await handleDispute(order)
      await loadOrders()
      if (action === 'ship') {
        setShipDialogOrder(null)
        setShipConfirmOpen(false)
        setShipTrackingNo('')
        setShipTrackingError(null)
      }
    } catch (e) {
      if (!isUserCancelledAction(e)) {
        console.error('[pending-order-action-failed]', {
          action,
          escrow_pda: order.escrow_pda,
          asset: order.asset,
          role: order.role,
          error: e,
        })
      }
      notify(formatActionErrorMessage(e), 'error')
    } finally {
      setSubmittingId(null)
    }
  }

  const filteredOrders = useMemo(() => {
    switch (tab) {
      case 'to_ship':
        return orders.filter((o) => o.role === 'seller' && o.state === 'Paid')
      case 'to_receive':
        return orders.filter((o) => o.role === 'buyer' && (o.state === 'Paid' || o.state === 'Shipped'))
      case 'disputed':
        return orders.filter((o) => o.state === 'Disputed')
      case 'completed':
        return orders.filter((o) => o.state === 'Released')
      case 'cancelled':
        return orders.filter((o) => o.state === 'Cancelled')
      default:
        return orders.filter((o) =>
          ['Paid', 'Shipped', 'Disputed', 'Released', 'Cancelled'].includes(o.state),
        )
    }
  }, [orders, tab])

  function renderOrderCard(order: PendingOrder) {
    const priceSol = lamportsToSol(order.price)
    const canShip = order.role === 'seller' && order.state === 'Paid'
    const canConfirm = order.role === 'buyer' && order.state === 'Shipped'
    const canDispute = order.state === 'Shipped'
    const canCancel = order.state === 'Paid'
    return (
      <div key={`${order.escrow_pda}-${order.role}`} className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className={['rounded-md px-2 py-0.5 text-[11px] font-semibold', stateClass(order.state)].join(' ')}>
            {mapStateLabel(order.state, order.role, order.cancelled_by, publicKey?.toBase58())}
          </span>
          <span className="text-[11px] text-muted-foreground">{formatOrderTime(order.updated_at)}</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
          <p className="text-sm font-semibold text-foreground">
            {order.bookName?.trim() || '未命名书籍'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
          <span className="text-muted-foreground">订单</span>
          <span className="font-mono text-foreground">{shortenPubkey(order.escrow_pda)}</span>
          <span className="text-muted-foreground">金额</span>
          <span className="font-semibold text-primary">
            {order.priceCny != null && order.priceCny > 0
              ? `¥${order.priceCny.toFixed(2)} (${priceSol.toFixed(3)} SOL)`
              : `${priceSol.toFixed(3)} SOL`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {canShip && (
            <Button
              type="button"
              disabled={submittingId === `${order.escrow_pda}:ship`}
              onClick={() => {
                setShipDialogOrder(order)
                setShipTrackingNo('')
              }}
              variant="outline"
              className="h-10 px-4 text-sm border-primary/40 text-primary"
            >
              {submittingId === `${order.escrow_pda}:ship` ? '提交中...' : '确认发货'}
            </Button>
          )}
          {canConfirm && (
            <Button
              type="button"
              disabled={submittingId === `${order.escrow_pda}:confirm`}
              onClick={() => void runOrderAction(order, 'confirm')}
              variant="outline"
              className="h-10 px-4 text-sm border-primary/40 text-primary"
            >
              {submittingId === `${order.escrow_pda}:confirm` ? '提交中...' : '确认收货'}
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              disabled={submittingId === `${order.escrow_pda}:cancel`}
              onClick={() => void runOrderAction(order, 'cancel')}
              variant="outline"
              className="h-10 px-4 text-sm"
            >
              {submittingId === `${order.escrow_pda}:cancel` ? '提交中...' : '取消订单'}
            </Button>
          )}
          {canDispute && (
            <Button
              type="button"
              disabled={submittingId === `${order.escrow_pda}:dispute`}
              onClick={() => void runOrderAction(order, 'dispute')}
              variant="outline"
              className="h-10 px-4 text-sm border-destructive/40 text-destructive"
            >
              {submittingId === `${order.escrow_pda}:dispute` ? '提交中...' : '申请仲裁'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {TAB_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTab(opt.key)}
              className={[
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                tab === opt.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {sessionStatus === 'loading' ? (
          <div className="py-20 text-center text-sm text-muted-foreground">加载中…</div>
        ) : !isAuthenticated ? (
          <div className="flex min-h-[min(52vh,480px)] flex-col items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground gap-2">
            <p>请先登录查看你的订单。</p>
            <p className="text-xs">登录后可区分「待发货」「待收货」「已完成」「已取消」。</p>
          </div>
        ) : error ? (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">加载中…</div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex min-h-[min(52vh,480px)] flex-col items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground">
            当前分类暂无订单
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredOrders.map(renderOrderCard)}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(shipDialogOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setShipDialogOrder(null)
            setShipConfirmOpen(false)
            setShipTrackingNo('')
            setShipTrackingError(null)
          }
        }}
      >
        <DialogContent className="max-w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>确认发货</DialogTitle>
            <DialogDescription>请填写物流单号后再提交发货。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              value={shipTrackingNo}
              onChange={(e) => {
                const filtered = e.target.value.replace(/[^A-Za-z0-9-]/g, '')
                setShipTrackingNo(filtered)
                if (shipTrackingError) setShipTrackingError(null)
              }}
              placeholder="请输入物流单号"
              className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
            />
            {shipTrackingError ? <p className="text-xs text-destructive">{shipTrackingError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShipDialogOrder(null)
                  setShipConfirmOpen(false)
                  setShipTrackingNo('')
                  setShipTrackingError(null)
                }}
                disabled={submittingId === `${shipDialogOrder?.escrow_pda ?? ''}:ship`}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  if (!shipDialogOrder) return
                  const err = validateTrackingNo(shipTrackingNo)
                  if (err) {
                    setShipTrackingError(err)
                    return
                  }
                  setShipTrackingNo(normalizeTrackingNo(shipTrackingNo))
                  setShipTrackingError(null)
                  setShipConfirmOpen(true)
                }}
                disabled={!shipTrackingNo.trim() || submittingId === `${shipDialogOrder?.escrow_pda ?? ''}:ship`}
              >
                下一步
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shipConfirmOpen}
        onOpenChange={(open) => {
          if (submittingId === `${shipDialogOrder?.escrow_pda ?? ''}:ship`) return
          setShipConfirmOpen(open)
        }}
      >
        <DialogContent className="max-w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>确认提交发货</DialogTitle>
            <DialogDescription>
              请确认物流单号无误。提交后将用于订单发货流程，建议仅填写真实有效单号。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border/70 bg-secondary/20 p-3 text-sm">
              <p className="text-xs text-muted-foreground">物流单号</p>
              <p className="mt-1 font-mono text-foreground break-all">{normalizeTrackingNo(shipTrackingNo)}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShipConfirmOpen(false)}
                disabled={submittingId === `${shipDialogOrder?.escrow_pda ?? ''}:ship`}
              >
                返回修改
              </Button>
              <Button
                onClick={() => {
                  if (!shipDialogOrder) return
                  void runOrderAction(shipDialogOrder, 'ship')
                }}
                disabled={submittingId === `${shipDialogOrder?.escrow_pda ?? ''}:ship`}
              >
                {submittingId === `${shipDialogOrder?.escrow_pda ?? ''}:ship` ? '提交中...' : '确认发货'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {notice ? (
        <div
          className={[
            'fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-sm shadow-sm border',
            notice.tone === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-primary/20 bg-primary/10 text-primary',
          ].join(' ')}
        >
          {notice.message}
        </div>
      ) : null}
    </div>
  )
}
