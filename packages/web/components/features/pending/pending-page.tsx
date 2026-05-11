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
  type EscrowBroadcastResponse,
} from '@/lib/api/escrow'
import { fetchOrderShippingCipher } from '@/lib/api/shipping-cipher'
import { fetchBookDetail } from '@/lib/api/book-detail'
import { requestMarketListRefresh } from '@/lib/market-refresh'
import { shortenPubkey } from '@/lib/format-seller'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

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

type MetadataProofCheck = {
  metadataUrl: string
  cid: string | null
  resolvedCid: string | null
  cidMatched: boolean
  chainHashHex: string | null
  backendHashHex: string | null
  pinataHashHex: string | null
  pinataJsonText: string | null
  pinataJsonPretty: string | null
}

function formatActionErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const normalized = raw.toLowerCase()
  if (
    normalized.includes('custom program error') ||
    normalized.includes('transaction simulation failed') ||
    normalized.includes('broadcastfailed')
  ) {
    return `链上校验未通过：${raw.trim()}`
  }
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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((x) => x.toString(16).padStart(2, '0')).join('')
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256Bytes(data: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

async function sha256HexFromText(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return bytesToHex(new Uint8Array(digest))
}

function commitmentToHex(commitment: number[] | null | undefined) {
  if (!Array.isArray(commitment) || commitment.length === 0) return null
  return bytesToHex(Uint8Array.from(commitment.map((x) => Number(x) & 0xff)))
}

async function fetchPinataContentByCid(cid: string) {
  const normalizedCid = cid.trim()
  if (!normalizedCid) return null
  const urls = [
    `https://gateway.pinata.cloud/ipfs/${normalizedCid}`,
    `https://ipfs.io/ipfs/${normalizedCid}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const rawText = await res.text()
      return rawText
    } catch {
      // 尝试下一个网关
    }
  }
  return null
}

function extractCidFromMetadataUrl(metadataUrl: string) {
  const matched = metadataUrl.match(/\/ipfs\/([^/?#]+)/i)
  return matched?.[1] ?? null
}

async function decryptShippingCipherForSeller(
  sellerCiphertext: string,
  sellerNonce: string,
  sellerPubkey: string,
) {
  const key = localStorage.getItem(`bookchain:comm-key:${sellerPubkey}`)
  if (!key) throw new Error('本地通讯私钥不存在，请先到个人中心恢复后再试。')
  const sellerPriv = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(key),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    ['deriveBits'],
  )
  const parsed = JSON.parse(sellerCiphertext) as { epk: string; ct: string }
  const ephPub = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(parsed.epk),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'X25519', public: ephPub } as EcdhKeyDeriveParams,
      sellerPriv,
      256,
    ),
  )
  const iv = base64ToBytes(sellerNonce)
  const keySeed = new Uint8Array(shared.length + iv.length)
  keySeed.set(shared, 0)
  keySeed.set(iv, shared.length)
  const aesRaw = await sha256Bytes(keySeed)
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, base64ToBytes(parsed.ct))
  return new TextDecoder().decode(plain)
}

export function PendingPage() {
  const { isAuthenticated, sessionStatus, login, authLoading, authError } = useAuth()
  const { publicKey, signTransaction, signMessage } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [tab, setTab] = useState<PendingTab>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [shipDialogOrder, setShipDialogOrder] = useState<PendingOrder | null>(null)
  const [shipTrackingNo, setShipTrackingNo] = useState('')
  const [shipConfirmOpen, setShipConfirmOpen] = useState(false)
  const [shipTrackingError, setShipTrackingError] = useState<string | null>(null)
  const [confirmDialogOrder, setConfirmDialogOrder] = useState<PendingOrder | null>(null)
  const [confirmFinalOpen, setConfirmFinalOpen] = useState(false)
  const [confirmFinalChecked, setConfirmFinalChecked] = useState(false)
  const [confirmChecking, setConfirmChecking] = useState(false)
  const [confirmProof, setConfirmProof] = useState<MetadataProofCheck | null>(null)
  const [confirmCheckError, setConfirmCheckError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone; durationMs?: number } | null>(
    null,
  )
  const [decryptingShippingOrder, setDecryptingShippingOrder] = useState<string | null>(null)
  const [shippingPlainMap, setShippingPlainMap] = useState<Record<string, string>>({})
  const [shippingErrMap, setShippingErrMap] = useState<Record<string, string>>({})
  const [shippingVisibleMap, setShippingVisibleMap] = useState<Record<string, boolean>>({})

  function notify(message: string, tone: NoticeTone = 'info', durationMs?: number) {
    setNotice({ message, tone, durationMs })
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.durationMs ?? 3000)
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

  async function checkBookMetadataProof(order: PendingOrder) {
    setConfirmChecking(true)
    setConfirmCheckError(null)
    try {
      const detail = await fetchBookDetail(order.asset)
      const metadataUrl = detail.book.metadata_url?.trim()
      if (!metadataUrl) throw new Error('后端未返回 metadata_url，无法校验')
      const cid = extractCidFromMetadataUrl(metadataUrl)
      let resolvedCid: string | null = null
      let pinataJsonText: string | null = null
      try {
        const res = await fetch(metadataUrl, { cache: 'no-store' })
        if (res.ok) {
          pinataJsonText = await res.text()
          resolvedCid = extractCidFromMetadataUrl(res.url) ?? extractCidFromMetadataUrl(metadataUrl)
        }
      } catch {
        // fallback 到 CID 网关
      }
      if (!pinataJsonText && cid) {
        pinataJsonText = await fetchPinataContentByCid(cid)
        if (pinataJsonText) resolvedCid = cid
      }
      const cidMatched = Boolean(cid && resolvedCid && cid === resolvedCid)
      const chainHashHex = commitmentToHex(detail.book.metadata_hash)
      const backendHashHex = chainHashHex
      const pinataHashHex = pinataJsonText ? await sha256HexFromText(pinataJsonText) : null
      let pinataJsonPretty: string | null = null
      if (pinataJsonText) {
        try {
          const parsed = JSON.parse(pinataJsonText) as unknown
          pinataJsonPretty = JSON.stringify(parsed, null, 2)
        } catch {
          pinataJsonPretty = pinataJsonText
        }
      }
      setConfirmProof({
        metadataUrl,
        cid,
        resolvedCid,
        cidMatched,
        chainHashHex,
        backendHashHex,
        pinataHashHex,
        pinataJsonText,
        pinataJsonPretty,
      })
      if (!cid) {
        setConfirmCheckError('metadata_url 中未解析到 CID，无法完成一致性校验。')
      } else if (!resolvedCid || !cidMatched) {
        setConfirmCheckError('Pinata 返回 CID 与 metadata_url 中 CID 不一致，请勿确认收货。')
      } else if (!chainHashHex) {
        setConfirmCheckError('当前后端未返回 metadata_hash，无法完成链上哈希校验。')
      } else if (!pinataHashHex) {
        setConfirmCheckError('未拉取到 Pinata JSON，无法完成三方校验。')
      } else if (pinataHashHex !== chainHashHex) {
        setConfirmCheckError('Pinata JSON 哈希与链上/后端记录不一致，请勿确认收货。')
      }
    } catch (e) {
      setConfirmProof(null)
      setConfirmCheckError(e instanceof Error ? e.message : '校验失败')
    } finally {
      setConfirmChecking(false)
    }
  }

  async function handleCancel(order: PendingOrder): Promise<EscrowBroadcastResponse> {
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
    return broadcastCancelEscrow({
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

  async function handleDecryptBuyerAddress(order: PendingOrder) {
    if (!publicKey) return
    const escrowPda = order.escrow_pda
    if (shippingVisibleMap[escrowPda]) {
      setShippingVisibleMap((prev) => ({ ...prev, [escrowPda]: false }))
      return
    }
    if (shippingPlainMap[escrowPda]) {
      setShippingVisibleMap((prev) => ({ ...prev, [escrowPda]: true }))
      return
    }
    setDecryptingShippingOrder(escrowPda)
    setShippingErrMap((prev) => ({ ...prev, [escrowPda]: '' }))
    try {
      const payload = await fetchOrderShippingCipher(escrowPda)
      const plain = await decryptShippingCipherForSeller(
        payload.seller_ciphertext,
        payload.seller_nonce,
        publicKey.toBase58(),
      )
      setShippingPlainMap((prev) => ({ ...prev, [escrowPda]: plain }))
      setShippingVisibleMap((prev) => ({ ...prev, [escrowPda]: true }))
    } catch (e) {
      setShippingErrMap((prev) => ({
        ...prev,
        [escrowPda]: e instanceof Error ? e.message : '解密收货地址失败',
      }))
    } finally {
      setDecryptingShippingOrder(null)
    }
  }

  async function runOrderAction(order: PendingOrder, action: 'ship' | 'confirm' | 'cancel' | 'dispute') {
    setSubmittingId(`${order.escrow_pda}:${action}`)
    try {
      let cancelBroadcast: EscrowBroadcastResponse | undefined
      if (action === 'ship') await handleShip(order, shipTrackingNo)
      if (action === 'confirm') await handleConfirm(order)
      if (action === 'cancel') {
        cancelBroadcast = await handleCancel(order)
      }
      if (action === 'dispute') await handleDispute(order)
      await loadOrders()
      if (action === 'cancel') {
        requestMarketListRefresh()
        if (cancelBroadcast) {
          notify(
            cancelBroadcast.msg,
            'info',
            cancelBroadcast.db_synced === false ? 9000 : undefined,
          )
        }
      }
      if (action === 'ship') {
        setShipDialogOrder(null)
        setShipConfirmOpen(false)
        setShipTrackingNo('')
        setShipTrackingError(null)
        notify('发货提交成功', 'info', 2500)
      }
      if (action === 'confirm') {
        setConfirmFinalOpen(false)
        setConfirmFinalChecked(false)
        setConfirmDialogOrder(null)
        setConfirmProof(null)
        setConfirmCheckError(null)
        notify('确认收货提交成功', 'info', 2500)
      }
      if (action === 'dispute') {
        notify('仲裁申请已提交', 'info', 2500)
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

  const submittingActionLabel = useMemo(() => {
    if (!submittingId) return null
    const action = submittingId.split(':')[1]
    switch (action) {
      case 'ship':
        return '正在提交发货交易，请勿关闭页面...'
      case 'confirm':
        return '正在提交确认收货交易，请勿关闭页面...'
      case 'cancel':
        return '正在提交取消订单交易，请勿关闭页面...'
      case 'dispute':
        return '正在提交仲裁申请，请勿关闭页面...'
      default:
        return '正在提交链上操作，请勿关闭页面...'
    }
  }, [submittingId])

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
    const canViewBuyerAddress = order.role === 'seller' && (order.state === 'Paid' || order.state === 'Shipped')
    const shippingPlaintext = shippingPlainMap[order.escrow_pda]
    const shippingVisible = Boolean(shippingVisibleMap[order.escrow_pda])
    const shippingError = shippingErrMap[order.escrow_pda]
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
              onClick={() => {
                setConfirmDialogOrder(order)
                setConfirmProof(null)
                setConfirmCheckError(null)
                void checkBookMetadataProof(order)
              }}
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
        {canViewBuyerAddress ? (
          <div className="border-t border-border pt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">买家收货地址（端到端加密）</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void handleDecryptBuyerAddress(order)
                }}
                disabled={decryptingShippingOrder === order.escrow_pda}
              >
                {decryptingShippingOrder === order.escrow_pda
                  ? '读取中...'
                  : shippingVisible
                    ? '隐藏地址'
                    : '查看地址'}
              </Button>
            </div>
            {shippingPlaintext && shippingVisible ? (
              <div className="rounded-md bg-secondary/50 px-2.5 py-2 text-xs text-foreground whitespace-pre-wrap">
                <div className="mb-1 flex items-center justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shippingPlaintext)
                        notify('地址已复制')
                      } catch {
                        notify('复制失败，请手动复制', 'error')
                      }
                    }}
                  >
                    复制
                  </Button>
                </div>
                {shippingPlaintext}
              </div>
            ) : null}
            {shippingError ? <p className="text-xs text-destructive">{shippingError}</p> : null}
          </div>
        ) : null}
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
        ) : !publicKey ? (
          <div className="flex min-h-[min(52vh,480px)] flex-col items-center justify-center px-4 py-16 gap-4 text-center">
            <Button
              type="button"
              onClick={openWalletConnect}
              className="bg-primary text-primary-foreground px-8 h-11 rounded-xl font-semibold"
            >
              连接钱包
            </Button>
            <p className="text-xs text-muted-foreground">登录查看订单</p>
          </div>
        ) : !isAuthenticated ? (
          <div className="flex min-h-[min(52vh,480px)] flex-col items-center justify-center px-4 py-16 gap-3 text-center">
            <Button
              type="button"
              onClick={() => void login({ publicKey, signMessage })}
              disabled={authLoading || !signMessage}
              className="bg-amber-500 text-amber-950 hover:bg-amber-400 px-8 h-11 rounded-xl font-semibold"
            >
              {authLoading ? '处理中…' : '验证登录'}
            </Button>
            <p className="text-xs text-muted-foreground">登录查看订单</p>
            {authError ? <p className="text-xs text-destructive max-w-sm">{authError}</p> : null}
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
        open={Boolean(confirmDialogOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialogOrder(null)
            setConfirmFinalOpen(false)
            setConfirmFinalChecked(false)
            setConfirmProof(null)
            setConfirmCheckError(null)
          }
        }}
      >
        <DialogContent className="max-w-[min(92vw,640px)] max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>确认收货前校验</DialogTitle>
            <DialogDescription>
              系统将会比对三方校验，仅在比对通过后允许确认收货。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!confirmDialogOrder) return
                  void checkBookMetadataProof(confirmDialogOrder)
                }}
                disabled={!confirmDialogOrder || confirmChecking}
              >
                {confirmChecking ? '校验中...' : '重新执行三方校验'}
              </Button>
            </div>

            {confirmProof ? (
              <div className="space-y-2 rounded-md border border-border/70 bg-secondary/20 p-3 text-xs">
                <p className="text-muted-foreground">Metadata URL</p>
                <p className="font-mono break-all text-foreground leading-5">{confirmProof.metadataUrl}</p>
                <p className="text-muted-foreground mt-2">Metadata CID</p>
                <p className="font-mono break-all text-foreground leading-5">{confirmProof.cid ?? '未解析到 CID'}</p>
                <p className="text-muted-foreground mt-2">Pinata 返回 CID</p>
                <p className="font-mono break-all text-foreground leading-5">{confirmProof.resolvedCid ?? '未解析到 CID'}</p>
                <p className={confirmProof.cidMatched ? 'text-primary' : 'text-destructive'}>
                  {confirmProof.cidMatched ? 'CID 一致性校验通过' : 'CID 一致性校验未通过'}
                </p>
                <p className="text-muted-foreground mt-2">链上 / 后端 metadata_hash</p>
                <p className="font-mono break-all text-foreground leading-5">{confirmProof.chainHashHex ?? '后端未返回'}</p>
                <p className="text-muted-foreground mt-2">Pinata JSON 哈希（SHA-256）</p>
                <p className="font-mono break-all text-foreground leading-5">{confirmProof.pinataHashHex ?? '未拉取到 Pinata JSON'}</p>
                <p className={confirmProof.chainHashHex && confirmProof.pinataHashHex && confirmProof.chainHashHex === confirmProof.pinataHashHex ? 'text-primary' : 'text-destructive'}>
                  {confirmProof.chainHashHex && confirmProof.pinataHashHex && confirmProof.chainHashHex === confirmProof.pinataHashHex
                    ? '三方哈希比对通过'
                    : '三方哈希比对未通过'}
                </p>
              </div>
            ) : null}

            {confirmProof?.pinataJsonPretty != null ? (
              <details className="space-y-1 rounded-md border border-border/70 bg-secondary/10 p-2">
                <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                  技术详情：查看 Pinata 文件内容预览（调试用）
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border/70 bg-background p-2 text-xs whitespace-pre-wrap break-words">
                  {confirmProof.pinataJsonPretty.slice(0, 3000)}
                </pre>
              </details>
            ) : null}

            {confirmCheckError ? <p className="text-xs text-destructive break-words">{confirmCheckError}</p> : null}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmDialogOrder(null)
                  setConfirmFinalOpen(false)
                  setConfirmFinalChecked(false)
                  setConfirmProof(null)
                  setConfirmCheckError(null)
                }}
                disabled={Boolean(confirmDialogOrder && submittingId === `${confirmDialogOrder.escrow_pda}:confirm`)}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  if (!confirmDialogOrder) return
                  setConfirmFinalChecked(false)
                  setConfirmFinalOpen(true)
                }}
                disabled={
                  !confirmDialogOrder ||
                  !confirmProof ||
                  !confirmProof.cidMatched ||
                  !confirmProof.chainHashHex ||
                  !confirmProof.pinataHashHex ||
                  confirmProof.chainHashHex !== confirmProof.pinataHashHex ||
                  submittingId === `${confirmDialogOrder.escrow_pda}:confirm`
                }
              >
                {confirmDialogOrder && submittingId === `${confirmDialogOrder.escrow_pda}:confirm`
                  ? '提交中...'
                  : '校验通过，确认收货'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmFinalOpen}
        onOpenChange={(open) => {
          if (submittingId === `${confirmDialogOrder?.escrow_pda ?? ''}:confirm`) return
          if (!open) setConfirmFinalChecked(false)
          setConfirmFinalOpen(open)
        }}
      >
        <DialogContent className="max-w-[min(92vw,520px)]">
          <DialogHeader>
            <DialogTitle>最终确认收货</DialogTitle>
            <DialogDescription>请确认后再提交。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
              请确保收到的书籍和卖家描述一致！
            </div>
            <label className="flex items-start gap-2 rounded-md border border-border/70 bg-secondary/20 p-2 text-sm text-foreground cursor-pointer">
              <Checkbox
                checked={confirmFinalChecked}
                onCheckedChange={(checked) => setConfirmFinalChecked(Boolean(checked))}
                className="mt-0.5"
              />
              <span>我已确认收货的书籍和图片以及描述相符合，没有问题，确认收货。</span>
            </label>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmFinalOpen(false)}
              disabled={Boolean(confirmDialogOrder && submittingId === `${confirmDialogOrder.escrow_pda}:confirm`)}
            >
              返回
            </Button>
            <Button
              onClick={() => {
                if (!confirmDialogOrder) return
                void runOrderAction(confirmDialogOrder, 'confirm')
              }}
              disabled={
                !confirmFinalChecked ||
                Boolean(confirmDialogOrder && submittingId === `${confirmDialogOrder.escrow_pda}:confirm`)
              }
            >
              {confirmDialogOrder && submittingId === `${confirmDialogOrder.escrow_pda}:confirm`
                ? '提交中...'
                : '确认收货'}
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

      {submittingActionLabel ? (
        <div className="fixed inset-0 z-[125] bg-black/40 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="rounded-xl border border-primary/20 bg-background/95 shadow-xl px-4 py-3 min-w-[min(92vw,360px)]">
            <div className="flex items-center gap-2.5">
              <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-foreground">{submittingActionLabel}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
