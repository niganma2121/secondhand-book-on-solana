'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { useChatConversationsContext } from '@/components/providers/chat-conversations-provider'
import { useOrderAttention } from '@/components/providers/order-attention-provider'
import {
  type EscrowOrder,
  fetchMyBuyingOrders,
  fetchMySellingOrders,
} from '@/lib/api/orders'
import {
  broadcastCancelEscrow,
  broadcastConfirmEscrow,
  broadcastOpenDispute,
  broadcastSetPreShipLock,
  broadcastShipEscrow,
  buildCancelEscrow,
  buildConfirmEscrow,
  buildOpenDispute,
  buildSetPreShipLock,
  buildShipEscrow,
  signEscrowTxWithWallet,
  type EscrowBroadcastResponse,
} from '@/lib/api/escrow'
import { submitOrderReview } from '@/lib/api/reviews'
import { ApiError } from '@/lib/api/client'
import { fetchOrderShippingCipher, upsertOrderShippingCipher } from '@/lib/api/shipping-cipher'
import { fetchMyShippingAddresses, createMyShippingAddress } from '@/lib/api/shipping-addresses'
import {
  decryptMyShippingAddressPayload,
  encryptShippingJsonForSelf,
  formatShippingAddressPlaintext,
  type DecryptedShippingAddressRow,
} from '@/lib/shipping-address-client'
import { encryptShippingPlaintextForSeller } from '@/lib/shipping-e2e-encrypt'
import { fetchOrderTrackingCipher, upsertOrderTrackingCipher } from '@/lib/api/tracking-cipher'
import { fetchUserEncryptionPublicKey } from '@/lib/api/encryption'
import { ensureCommKeyReady } from '@/lib/encryption/comm-key-provision'
import { env } from '@/lib/env'
import { areaList } from '@vant/area-data'
import { fetchBookDetail } from '@/lib/api/book-detail'
import { uploadCreateBookDetail } from '@/lib/api/book-listing'
import {
  getDisputeSubmission,
  postDisputeSubmission,
  type DisputeSubmissionResponse,
  type DisputeSubmissionRevision,
} from '@/lib/api/dispute-submission'
import { splitDisputePrivateText } from '@/lib/dispute-private-text'
import { requestMarketListRefresh } from '@/lib/market-refresh'
import Link from 'next/link'
import { shortenPubkey } from '@/lib/format-seller'
import { marketBookDetail, routes, shelfMyEscrowTrades, userPublicProfile } from '@/config/routes'
import { isArbitratorPubkey } from '@/lib/arbitration-access'
import { isOrderTerminalForBookSnapshot } from '@/lib/order-book-snapshot'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ImageLightboxDialog } from '@/components/shared/image-lightbox-dialog'

type PendingTab = 'all' | 'to_ship' | 'to_receive' | 'disputed' | 'completed' | 'cancelled'
type Role = 'buyer' | 'seller'

type PendingOrder = EscrowOrder & {
  role: Role
  bookName?: string
  bookCover?: string | null
  priceCny?: number | null
}

const NOTIFY_SHIPPING_ADDRESS_UPDATED =
  '我已通过站点加密更新了本单收货地址，请在「订单」页查看新的收货地址'
const NOTIFY_PRE_SHIP_LOCKED = '我已锁单备发货：你暂不可修改收货地址或取消订单，请留意后续发货通知。'
const NOTIFY_ORDER_CONFIRMED = '我已确认收货，本单已完成。'
const NOTIFY_DISPUTE_OPENED = '本单已发起仲裁，订单进入争议处理中。'

const TAB_OPTIONS: { key: PendingTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'to_ship', label: '待发货' },
  { key: 'to_receive', label: '待收货' },
  { key: 'disputed', label: '仲裁中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

async function decryptOrderShippingCipherForBuyer(
  payload: Awaited<ReturnType<typeof fetchOrderShippingCipher>>,
  walletPubkey: string,
): Promise<string | null> {
  if (!payload.buyer_ciphertext || !payload.buyer_nonce) return null
  const raw = localStorage.getItem(`bookchain:comm-key:${walletPubkey}`)
  if (!raw) return null
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(raw),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    ['deriveBits'],
  )
  const parsed = JSON.parse(payload.buyer_ciphertext) as { epk: string; ct: string }
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
      key,
      256,
    ),
  )
  const iv = base64ToBytes(payload.buyer_nonce)
  const keySeed = new Uint8Array(shared.length + iv.length)
  keySeed.set(shared, 0)
  keySeed.set(iv, shared.length)
  const aesRaw = new Uint8Array(await crypto.subtle.digest('SHA-256', keySeed))
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt'])
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, base64ToBytes(parsed.ct))
  return new TextDecoder().decode(plainBuf)
}

function normalizeShippingText(v: string) {
  return v.replace(/\s+/g, ' ').trim()
}

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

function parseShippingPlaintext(plain: string): {
  name?: string
  phone?: string
  address?: string
} {
  const normalized = plain.replace(/\n/g, ',').trim()
  if (!normalized) return {}
  const parts = normalized
    .split(/[，,]/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (parts.length < 2) return { address: normalized }
  const [name, phone, ...rest] = parts
  return {
    name,
    phone,
    address: rest.join('，').trim() || undefined,
  }
}

type NoticeTone = 'info' | 'error' | 'success'

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

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
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

async function encryptCipherForRecipient(recipientEncPubB64: string, plain: string) {
  const recipientPub = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(recipientEncPubB64),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    [],
  )
  const eph = (await crypto.subtle.generateKey(
    { name: 'X25519' } as EcKeyGenParams,
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'X25519', public: recipientPub } as EcdhKeyDeriveParams,
    eph.privateKey,
    256,
  ))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keySeed = new Uint8Array(shared.length + iv.length)
  keySeed.set(shared, 0)
  keySeed.set(iv, shared.length)
  const aesRaw = await sha256Bytes(keySeed)
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['encrypt'])
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plain)),
  )
  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  return {
    ciphertext: JSON.stringify({ epk: bytesToBase64(ephPub), ct: bytesToBase64(ct) }),
    nonce: bytesToBase64(iv),
    alg: 'x25519_aesgcm_v1',
  }
}

async function decryptCipherByLocalCommKey(ciphertext: string, nonce: string, localPubkey: string) {
  const key = localStorage.getItem(`bookchain:comm-key:${localPubkey}`)
  if (!key) throw new Error('本地通讯私钥不存在，请先到个人中心恢复后再试。')
  const localPriv = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(key),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    ['deriveBits'],
  )
  const parsed = JSON.parse(ciphertext) as { epk: string; ct: string }
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
      localPriv,
      256,
    ),
  )
  const iv = base64ToBytes(nonce)
  const keySeed = new Uint8Array(shared.length + iv.length)
  keySeed.set(shared, 0)
  keySeed.set(iv, shared.length)
  const aesRaw = await sha256Bytes(keySeed)
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, base64ToBytes(parsed.ct))
  return new TextDecoder().decode(plain)
}

function parseDisputeAttachmentUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/** 发起仲裁所在本地自然日 +5 天的日末（展示为当日 24:00 前） */
function disputeArbitrationDeadlineLocal(disputedAtSec: number): Date {
  const s = new Date(disputedAtSec * 1000)
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 5, 23, 59, 59, 999)
}

function disputeDeadlineNote(order: EscrowOrder): string {
  const baseSec = order.disputed_at ?? order.updated_at
  const end = disputeArbitrationDeadlineLocal(baseSec)
  const endStr = end.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  return `仲裁结束最晚时间为：发起仲裁所在自然日起第 5 天的 24:00 前（按本地时区不晚于 ${endStr}）。演示环境无链上自动处罚。`
}

/** 与后端 `post_dispute_submission_handler` 一致 */
const DISPUTE_MAX_EVIDENCE_IMAGES = 7

function disputeFileKey(f: File): string {
  return `${f.name}\0${f.size}\0${f.lastModified}`
}

/** 多次选择文件时追加，去重，截断至上限 */
function mergeDisputeEvidenceFiles(prev: File[], picked: File[]): File[] {
  const seen = new Set(prev.map(disputeFileKey))
  const out = [...prev]
  for (const f of picked) {
    const k = disputeFileKey(f)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
    if (out.length >= DISPUTE_MAX_EVIDENCE_IMAGES) break
  }
  return out.slice(0, DISPUTE_MAX_EVIDENCE_IMAGES)
}

/** 与 `confirmDisputeSubmit` 内校验一致，供「预览」前使用 */
function validateDisputeFormFields(args: {
  publicText: string
  privateText: string
  trackingNo: string
  evidenceCount: number
}): string | null {
  const pub = args.publicText.trim()
  if (!pub) return '请填写公开说明（对方与仲裁员均可见）'
  if (pub.length > 8000) return '公开说明过长'
  const tracking = args.trackingNo.trim()
  if (tracking.length > 128) return '物流单号过长'
  const priv = args.privateText.trim()
  const privateParts: string[] = []
  if (priv.length > 0) privateParts.push(priv)
  if (tracking.length > 0) privateParts.push(`【物流单号（仅仲裁员可见）】${tracking}`)
  const privateCombined = privateParts.join('\n\n')
  if (privateCombined.length > 4000) return '仅仲裁员可见内容（含单号与补充说明）总长度须不超过 4000 字'
  if (args.evidenceCount > DISPUTE_MAX_EVIDENCE_IMAGES) {
    return `凭证图片最多 ${DISPUTE_MAX_EVIDENCE_IMAGES} 张`
  }
  return null
}

export function PendingPage() {
  const { isAuthenticated, sessionStatus, login, authLoading, authError, user } = useAuth()
  const { sendChatText, wsConnected } = useChatConversationsContext()
  const { markOrdersAttentionSeen } = useOrderAttention()
  const searchParams = useSearchParams()
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
  const [decryptingTrackingOrder, setDecryptingTrackingOrder] = useState<string | null>(null)
  const [trackingPlainMap, setTrackingPlainMap] = useState<Record<string, string>>({})
  const [trackingErrMap, setTrackingErrMap] = useState<Record<string, string>>({})
  const [trackingVisibleMap, setTrackingVisibleMap] = useState<Record<string, boolean>>({})
  const [reviewOrder, setReviewOrder] = useState<PendingOrder | null>(null)
  const [reviewScore, setReviewScore] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [disputeFormOrder, setDisputeFormOrder] = useState<PendingOrder | null>(null)
  const [disputePublicText, setDisputePublicText] = useState('')
  const [disputePrivateText, setDisputePrivateText] = useState('')
  const [disputeTrackingNo, setDisputeTrackingNo] = useState('')
  const [disputeEvidenceFiles, setDisputeEvidenceFiles] = useState<File[]>([])
  const [disputeEvidencePreviewUrls, setDisputeEvidencePreviewUrls] = useState<string[]>([])
  const [disputeImageLightboxUrl, setDisputeImageLightboxUrl] = useState<string | null>(null)
  const [disputeFormStep, setDisputeFormStep] = useState<'edit' | 'review'>('edit')
  const [disputePrivacyAck, setDisputePrivacyAck] = useState(false)
  const [disputeFormErr, setDisputeFormErr] = useState<string | null>(null)
  const [disputeMaterialView, setDisputeMaterialView] = useState<{
    order: PendingOrder
    scope: 'mine' | 'peer'
  } | null>(null)
  const [disputeMaterialLoading, setDisputeMaterialLoading] = useState(false)
  const [disputeMaterialErr, setDisputeMaterialErr] = useState<string | null>(null)
  const [disputeMaterialData, setDisputeMaterialData] = useState<{
    submissions: DisputeSubmissionResponse[]
    revisions: DisputeSubmissionRevision[]
  } | null>(null)
  const [onlyPostMaterial, setOnlyPostMaterial] = useState(false)
  const [changeAddressOrder, setChangeAddressOrder] = useState<PendingOrder | null>(null)
  const [changeAddrLoading, setChangeAddrLoading] = useState(false)
  const [changeAddrAddresses, setChangeAddrAddresses] = useState<DecryptedShippingAddressRow[]>([])
  const [changeAddrPickId, setChangeAddrPickId] = useState('')
  const [changeAddrErr, setChangeAddrErr] = useState<string | null>(null)
  const [changeAddrSubmitting, setChangeAddrSubmitting] = useState(false)
  const [changeAddrFormMode, setChangeAddrFormMode] = useState<'hidden' | 'create'>('hidden')
  const [changeAddrSavingNew, setChangeAddrSavingNew] = useState(false)
  const [caLabel, setCaLabel] = useState('')
  const [caName, setCaName] = useState('')
  const [caPhone, setCaPhone] = useState('')
  const [caProvinceCode, setCaProvinceCode] = useState('')
  const [caCityCode, setCaCityCode] = useState('')
  const [caDistrictCode, setCaDistrictCode] = useState('')
  const [caDetail, setCaDetail] = useState('')

  const walletPk = user?.pubkey ?? publicKey?.toBase58()

  const apiConfigured = !env.useMockData && Boolean(env.apiBaseUrl)
  const provinceMap = areaList.province_list as Record<string, string>
  const cityMap = areaList.city_list as Record<string, string>
  const districtMap = areaList.county_list as Record<string, string>

  const provinceOptions = useMemo(
    () => Object.entries(provinceMap).map(([code, name]) => ({ code, name })),
    [provinceMap],
  )
  const caCityOptions = useMemo(() => {
    if (!caProvinceCode) return []
    const prefix = caProvinceCode.slice(0, 2)
    return Object.entries(cityMap)
      .filter(([code]) => code.startsWith(prefix))
      .map(([code, name]) => ({ code, name }))
  }, [cityMap, caProvinceCode])
  const caDistrictOptions = useMemo(() => {
    if (!caCityCode) return []
    const prefix = caCityCode.slice(0, 4)
    return Object.entries(districtMap)
      .filter(([code]) => code.startsWith(prefix))
      .map(([code, name]) => ({ code, name }))
  }, [districtMap, caCityCode])

  function resetCaFields() {
    setCaLabel('')
    setCaName('')
    setCaPhone('')
    setCaProvinceCode('')
    setCaCityCode('')
    setCaDistrictCode('')
    setCaDetail('')
  }

  const refreshChangeAddrList = useCallback(async () => {
    if (!walletPk) throw new Error('未连接钱包')
    const addrRes = await fetchMyShippingAddresses()
    const decrypted = await Promise.all(
      addrRes.addresses.map((p) => decryptMyShippingAddressPayload(p, walletPk)),
    )
    setChangeAddrAddresses(decrypted)
    setChangeAddrPickId((prev) => (decrypted.some((d) => d.id === prev) ? prev : decrypted[0]?.id ?? ''))
  }, [walletPk])

  useEffect(() => {
    setChangeAddrFormMode('hidden')
    resetCaFields()
  }, [changeAddressOrder?.escrow_pda])

  function notify(message: string, tone: NoticeTone = 'info', durationMs?: number) {
    setNotice({ message, tone, durationMs })
  }

  function buildOrderFocusLink(escrowPda: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}${routes.pending}?focus=${encodeURIComponent(escrowPda)}`
  }

  function sendOrderNotice(peer: string, text: string, escrowPda: string) {
    const body = `${text}\n${buildOrderFocusLink(escrowPda)}`
    try {
      return sendChatText(peer, body)
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.durationMs ?? 2000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!disputeMaterialView) {
      setDisputeMaterialData(null)
      setDisputeMaterialErr(null)
      setDisputeMaterialLoading(false)
      return
    }
    const pda = disputeMaterialView.order.escrow_pda
    let cancelled = false
    setDisputeMaterialLoading(true)
    setDisputeMaterialErr(null)
    setDisputeMaterialData(null)
    void getDisputeSubmission(pda)
      .then((d) => {
        if (!cancelled)
          setDisputeMaterialData({
            submissions: d.submissions,
            revisions: d.revisions ?? [],
          })
      })
      .catch((e) => {
        if (!cancelled) {
          setDisputeMaterialErr(
            e instanceof ApiError ? e.message : e instanceof Error ? e.message : '加载失败',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setDisputeMaterialLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [disputeMaterialView?.order.escrow_pda])

  useEffect(() => {
    const urls = disputeEvidenceFiles.map((f) => URL.createObjectURL(f))
    setDisputeEvidencePreviewUrls(urls)
    return () => {
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [disputeEvidenceFiles])

  useEffect(() => {
    if (!isAuthenticated) return
    void markOrdersAttentionSeen()
  }, [isAuthenticated, markOrdersAttentionSeen])

  useEffect(() => {
    if (!changeAddressOrder || !walletPk) return
    let cancelled = false
    setChangeAddrLoading(true)
    setChangeAddrErr(null)
    ;(async () => {
      try {
        await refreshChangeAddrList()
        if (cancelled) return
      } catch (e) {
        if (!cancelled) setChangeAddrErr(e instanceof Error ? e.message : '加载地址失败')
      } finally {
        if (!cancelled) setChangeAddrLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [changeAddressOrder, walletPk, refreshChangeAddrList])

  const focusEscrow = searchParams.get('focus')

  useEffect(() => {
    if (!focusEscrow) return
    const id = `order-card-${focusEscrow}`
    const el = document.getElementById(id)
    if (!el) return
    let cancelled = false
    requestAnimationFrame(() => {
      if (cancelled) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-xl')
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-xl')
      }, 2800)
    })
    return () => {
      cancelled = true
    }
  }, [focusEscrow, orders])

  async function submitChangeShippingAddress() {
    if (!changeAddressOrder || !walletPk || !changeAddrPickId) return
    try {
      const addr = changeAddrAddresses.find((a) => a.id === changeAddrPickId)
      if (!addr) throw new Error('请选择收货地址')
      const plain = formatShippingAddressPlaintext(addr)

      // 若和当前订单里买家密文地址一致，直接提示无需修改（避免重复写入与重复通知）
      try {
        const currentCipher = await fetchOrderShippingCipher(changeAddressOrder.escrow_pda)
        const currentPlain = await decryptOrderShippingCipherForBuyer(currentCipher, walletPk)
        if (
          currentPlain &&
          normalizeShippingText(currentPlain) === normalizeShippingText(plain)
        ) {
          notify('修改的地址与原地址相同，无需修改', 'info', 1500)
          setChangeAddressOrder(null)
          return
        }
      } catch {
        // 无法读取当前密文时不阻断修改流程
      }

      if (!wsConnected) {
        notify('聊天服务未连接，请稍候再试或先打开「消息」页面', 'error')
        return
      }
      setChangeAddrSubmitting(true)
      setChangeAddrErr(null)
      const sellerEnc = await fetchUserEncryptionPublicKey(changeAddressOrder.seller)
      if (!sellerEnc.encryption_public_key?.trim()) {
        throw new Error('卖家尚未开通通讯加密公钥，无法加密同步地址')
      }
      const encrypted = await encryptShippingPlaintextForSeller(
        sellerEnc.encryption_public_key,
        plain,
        walletPk,
      )
      await upsertOrderShippingCipher(changeAddressOrder.escrow_pda, {
        ...encrypted,
        encryption_key_version: 'v1',
      })
      const orderLink = buildOrderFocusLink(changeAddressOrder.escrow_pda)
      const chatBody = `${NOTIFY_SHIPPING_ADDRESS_UPDATED}\n${orderLink}`
      const sent = sendChatText(changeAddressOrder.seller, chatBody)
      if (!sent) throw new Error('通知消息未能发送，请确认聊天已连接')
      notify('收货地址已加密更新，并已通知卖家')
      setChangeAddressOrder(null)
      void markOrdersAttentionSeen()
    } catch (e) {
      setChangeAddrErr(e instanceof Error ? e.message : '提交失败')
    } finally {
      setChangeAddrSubmitting(false)
    }
  }

  async function saveNewChangeAddrInDialog() {
    if (!walletPk || !signMessage) {
      notify('需要连接钱包并使用支持签名的钱包', 'error')
      return
    }
    if (!isAuthenticated || !apiConfigured) {
      notify('请先登录后再新增地址', 'error')
      return
    }
    const phone = caPhone.trim()
    if (!/^\d{11}$/.test(phone)) {
      notify('手机号需为11位数字', 'error')
      return
    }
    if (!caName.trim() || !caProvinceCode || !caCityCode || !caDistrictCode || !caDetail.trim()) {
      notify('请补全省、市、区与详细地址', 'error')
      return
    }
    setChangeAddrSavingNew(true)
    setChangeAddrErr(null)
    try {
      let pub = await fetchUserEncryptionPublicKey(walletPk)
      if (!pub.encryption_public_key?.trim()) {
        await ensureCommKeyReady({ walletAddress: walletPk, signMessage })
        pub = await fetchUserEncryptionPublicKey(walletPk)
      }
      const encPub = pub.encryption_public_key?.trim()
      if (!encPub) throw new Error('通讯加密公钥未就绪，请先在「我的」完成密钥初始化')
      const region = [provinceMap[caProvinceCode], cityMap[caCityCode], districtMap[caDistrictCode]]
        .filter(Boolean)
        .join(' ')
      const payload = {
        label: caLabel.trim() || `地址 ${changeAddrAddresses.length + 1}`,
        name: caName.trim(),
        phone,
        region,
        provinceCode: caProvinceCode,
        cityCode: caCityCode,
        districtCode: caDistrictCode,
        detail: caDetail.trim(),
      }
      const encrypted = await encryptShippingJsonForSelf(encPub, payload)
      await createMyShippingAddress({
        ...encrypted,
        is_default: changeAddrAddresses.length === 0,
      })
      await refreshChangeAddrList()
      setChangeAddrFormMode('hidden')
      resetCaFields()
      notify('地址已保存，请在上方选用后同步到本订单', 'success', 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存地址失败'
      setChangeAddrErr(msg)
      notify(msg, 'error', 2500)
    } finally {
      setChangeAddrSavingNew(false)
    }
  }

  async function runPreShipLock(order: PendingOrder) {
    setSubmittingId(`${order.escrow_pda}:prelock`)
    try {
      const { signTransaction } = await requireWalletReady()
      const built = await buildSetPreShipLock({
        seller: order.seller,
        buyer: order.buyer,
        asset: order.asset,
      })
      const signedTx = await signEscrowTxWithWallet(built.tx, signTransaction)
      await broadcastSetPreShipLock({
        signed_tx: signedTx,
        escrow_pda: order.escrow_pda,
      })
      void sendOrderNotice(order.buyer, NOTIFY_PRE_SHIP_LOCKED, order.escrow_pda)
      notify('已锁单备发货（链上生效）：买家不可再从链上取消托管')
      await loadOrders()
      void markOrdersAttentionSeen()
    } catch (e) {
      notify(e instanceof Error ? e.message : '锁单失败', 'error')
    } finally {
      setSubmittingId(null)
    }
  }

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

  async function handleSubmitReview() {
    if (!reviewOrder) return
    const reviewee = reviewOrder.role === 'buyer' ? reviewOrder.seller : reviewOrder.buyer
    setReviewSubmitting(true)
    try {
      await submitOrderReview({
        escrow_pda: reviewOrder.escrow_pda,
        reviewee,
        score: reviewScore,
        comment: reviewComment.trim() || null,
      })
      notify('评价提交成功', 'success', 2000)
      setReviewOrder(null)
      await loadOrders()
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : '评价提交失败'
      notify(msg, 'error', 2500)
    } finally {
      setReviewSubmitting(false)
    }
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
    const trackingNo = normalizeTrackingNo(trackingNoInput)
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
    try {
      const [buyerEnc, sellerEnc] = await Promise.all([
        fetchUserEncryptionPublicKey(order.buyer),
        fetchUserEncryptionPublicKey(order.seller),
      ])
      if (!buyerEnc.encryption_public_key?.trim()) {
        throw new Error('买家未配置通讯公钥，无法写入物流密文')
      }
      if (!sellerEnc.encryption_public_key?.trim()) {
        throw new Error('卖家未配置通讯公钥，无法写入物流密文')
      }
      const [forSeller, forBuyer] = await Promise.all([
        encryptCipherForRecipient(sellerEnc.encryption_public_key, trackingNo),
        encryptCipherForRecipient(buyerEnc.encryption_public_key, trackingNo),
      ])
      await upsertOrderTrackingCipher(order.escrow_pda, {
        seller_ciphertext: forSeller.ciphertext,
        seller_nonce: forSeller.nonce,
        seller_alg: forSeller.alg,
        buyer_ciphertext: forBuyer.ciphertext,
        buyer_nonce: forBuyer.nonce,
        buyer_alg: forBuyer.alg,
        encryption_key_version: 'v1',
      })
    } catch (e) {
      notify(
        `发货已上链，但物流密文保存失败：${e instanceof Error ? e.message : '请稍后重试'}`,
        'error',
        2800,
      )
    }
  }

  async function handleDecryptTracking(order: PendingOrder) {
    if (!publicKey) return
    const escrowPda = order.escrow_pda
    if (trackingVisibleMap[escrowPda]) {
      setTrackingVisibleMap((prev) => ({ ...prev, [escrowPda]: false }))
      return
    }
    if (trackingPlainMap[escrowPda]) {
      setTrackingVisibleMap((prev) => ({ ...prev, [escrowPda]: true }))
      return
    }
    setDecryptingTrackingOrder(escrowPda)
    setTrackingErrMap((prev) => ({ ...prev, [escrowPda]: '' }))
    try {
      const payload = await fetchOrderTrackingCipher(escrowPda)
      const local = publicKey.toBase58()
      if (order.role === 'buyer' && (!payload.buyer_ciphertext || !payload.buyer_nonce)) {
        throw new Error('卖家未提交可供买家查看的物流密文')
      }
      const plain = order.role === 'seller'
        ? await decryptCipherByLocalCommKey(payload.seller_ciphertext, payload.seller_nonce, local)
        : await decryptCipherByLocalCommKey(
            payload.buyer_ciphertext ?? '',
            payload.buyer_nonce ?? '',
            local,
          )
      const chainCommitHex = commitmentToHex(order.shipping_commitment)
      if (chainCommitHex) {
        const localCommit = await createShipCommitment(plain)
        const localHex = bytesToHex(Uint8Array.from(localCommit))
        if (localHex !== chainCommitHex) {
          throw new Error('物流单号校验失败：明文与链上 commitment 不一致')
        }
      }
      setTrackingPlainMap((prev) => ({ ...prev, [escrowPda]: plain }))
      setTrackingVisibleMap((prev) => ({ ...prev, [escrowPda]: true }))
    } catch (e) {
      setTrackingErrMap((prev) => ({
        ...prev,
        [escrowPda]: e instanceof Error ? e.message : '读取物流单号失败',
      }))
    } finally {
      setDecryptingTrackingOrder(null)
    }
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

  async function submitChainAndDisputeMaterial(
    order: PendingOrder,
    material: { publicText: string; publicUrls: string[]; privateText?: string },
  ) {
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
    await postDisputeSubmission(order.escrow_pda, {
      public_text: material.publicText,
      public_attachment_urls: material.publicUrls,
      ...(material.privateText != null && material.privateText.length > 0
        ? { private_text: material.privateText }
        : {}),
    })
  }

  function goDisputeReviewStep() {
    if (!disputeFormOrder) return
    const err = validateDisputeFormFields({
      publicText: disputePublicText,
      privateText: disputePrivateText,
      trackingNo: disputeTrackingNo,
      evidenceCount: disputeEvidenceFiles.length,
    })
    if (err) {
      setDisputeFormErr(err)
      return
    }
    setDisputeFormErr(null)
    setDisputePrivacyAck(false)
    setDisputeFormStep('review')
  }

  async function confirmDisputeSubmit() {
    const order = disputeFormOrder
    if (!order) return
    if (!disputePrivacyAck) {
      setDisputeFormErr('请先勾选确认项')
      return
    }
    const v = validateDisputeFormFields({
      publicText: disputePublicText,
      privateText: disputePrivateText,
      trackingNo: disputeTrackingNo,
      evidenceCount: disputeEvidenceFiles.length,
    })
    if (v) {
      setDisputeFormErr(v)
      return
    }
    const pub = disputePublicText.trim()
    const tracking = disputeTrackingNo.trim()
    const priv = disputePrivateText.trim()
    const privateParts: string[] = []
    if (priv.length > 0) privateParts.push(priv)
    if (tracking.length > 0) privateParts.push(`【物流单号（仅仲裁员可见）】${tracking}`)
    const privateCombined = privateParts.join('\n\n')
    if (!isAuthenticated || !apiConfigured) {
      notify('请先登录并配置 API 后再申请仲裁', 'error')
      return
    }
    setDisputeFormErr(null)
    setSubmittingId(`${order.escrow_pda}:dispute`)
    try {
      const urls: string[] = []
      for (const f of disputeEvidenceFiles) {
        const r = await uploadCreateBookDetail(f)
        urls.push(r.url)
      }
      if (onlyPostMaterial) {
        await postDisputeSubmission(order.escrow_pda, {
          public_text: pub,
          public_attachment_urls: urls,
          ...(privateCombined.length > 0 ? { private_text: privateCombined } : {}),
        })
        await loadOrders()
        void markOrdersAttentionSeen()
        notify('材料已保存', 'info', 2200)
      } else {
        await submitChainAndDisputeMaterial(order, {
          publicText: pub,
          publicUrls: urls,
          privateText: privateCombined.length > 0 ? privateCombined : undefined,
        })
        await loadOrders()
        void markOrdersAttentionSeen()
        const peer = order.role === 'buyer' ? order.seller : order.buyer
        void sendOrderNotice(peer, NOTIFY_DISPUTE_OPENED, order.escrow_pda)
        notify('链上已进入仲裁，材料已保存', 'info', 2800)
      }
      setDisputeFormOrder(null)
      setOnlyPostMaterial(false)
      setDisputeFormStep('edit')
      setDisputePrivacyAck(false)
      setDisputePublicText('')
      setDisputePrivateText('')
      setDisputeTrackingNo('')
      setDisputeEvidenceFiles([])
      setDisputeImageLightboxUrl(null)
    } catch (e) {
      if (!isUserCancelledAction(e)) {
        console.error('[pending-dispute-submit]', e)
      }
      notify(formatActionErrorMessage(e), 'error')
    } finally {
      setSubmittingId(null)
    }
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

  async function runOrderAction(order: PendingOrder, action: 'ship' | 'confirm' | 'cancel') {
    setSubmittingId(`${order.escrow_pda}:${action}`)
    try {
      let cancelBroadcast: EscrowBroadcastResponse | undefined
      if (action === 'ship') await handleShip(order, shipTrackingNo)
      if (action === 'confirm') await handleConfirm(order)
      if (action === 'cancel') {
        cancelBroadcast = await handleCancel(order)
      }
      await loadOrders()
      void markOrdersAttentionSeen()
      if (action === 'cancel') {
        requestMarketListRefresh()
        if (cancelBroadcast) {
          notify(
            cancelBroadcast.msg,
            'info',
            cancelBroadcast.db_synced === false ? 3000 : 2000,
          )
        }
      }
      if (action === 'ship') {
        setShipDialogOrder(null)
        setShipConfirmOpen(false)
        setShipTrackingNo('')
        setShipTrackingError(null)
        notify('发货提交成功', 'info', 2000)
      }
      if (action === 'confirm') {
        void sendOrderNotice(order.seller, NOTIFY_ORDER_CONFIRMED, order.escrow_pda)
        setConfirmFinalOpen(false)
        setConfirmFinalChecked(false)
        setConfirmDialogOrder(null)
        setConfirmProof(null)
        setConfirmCheckError(null)
        notify('确认收货提交成功', 'info', 2000)
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
      case 'prelock':
        return '正在锁单备发货…'
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
    /** 卖家待发货：锁单与确认发货共用一个按钮位（先锁单，再在同一位置确认发货） */
    const sellerPaidShipSlot = order.role === 'seller' && order.state === 'Paid'
    const canConfirm = order.role === 'buyer' && order.state === 'Shipped'
    const canDispute = order.state === 'Shipped'
    const canCancel =
      order.state === 'Paid' && !(order.role === 'buyer' && Boolean(order.pre_ship_locked))
    const canViewBuyerAddress = order.role === 'seller' && (order.state === 'Paid' || order.state === 'Shipped')
    const canViewTracking =
      (order.role === 'seller' || order.role === 'buyer') &&
      (order.state === 'Shipped' || order.state === 'Released' || order.state === 'Disputed')
    const shippingPlaintext = shippingPlainMap[order.escrow_pda]
    const shippingVisible = Boolean(shippingVisibleMap[order.escrow_pda])
    const shippingError = shippingErrMap[order.escrow_pda]
    const trackingPlaintext = trackingPlainMap[order.escrow_pda]
    const trackingVisible = Boolean(trackingVisibleMap[order.escrow_pda])
    const trackingError = trackingErrMap[order.escrow_pda]
    const canSubmitReview = order.state === 'Released' && !order.my_review_submitted
    return (
      <div
        key={`${order.escrow_pda}-${order.role}`}
        id={`order-card-${order.escrow_pda}`}
        className="bg-card border border-border rounded-xl p-4 space-y-3 transition-shadow"
      >
        <div className="flex items-center justify-between gap-2">
          <span className={['rounded-md px-2 py-0.5 text-[11px] font-semibold', stateClass(order.state)].join(' ')}>
            {mapStateLabel(order.state, order.role, order.cancelled_by, publicKey?.toBase58())}
          </span>
          <span className="text-[11px] text-muted-foreground">{formatOrderTime(order.updated_at)}</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-secondary/20 p-3 space-y-1">
          <Link
            href={marketBookDetail(order.asset, {
              orderEscrow: order.escrow_pda,
              orderState: order.state,
              returnTo: routes.pending,
            })}
            onClick={() => {
              try {
                sessionStorage.setItem('bookchain:market-detail-use-history-back', '1')
              } catch {
                /* private mode */
              }
              const key = `bookchain:order-book-snapshot:${order.escrow_pda}`
              try {
                if (order.book_snapshot != null && isOrderTerminalForBookSnapshot(order.state)) {
                  sessionStorage.setItem(key, JSON.stringify(order.book_snapshot))
                } else {
                  sessionStorage.removeItem(key)
                }
              } catch {
                /* private mode / quota */
              }
            }}
            className="text-sm font-semibold text-foreground hover:text-primary hover:underline underline-offset-2 inline-block"
          >
            {order.bookName?.trim() || '未命名书籍'}
          </Link>
          <p className="text-[10px] text-muted-foreground leading-snug">
            订单卡片上的书名为下单时快照。
            {isOrderTerminalForBookSnapshot(order.state) ? (
              <>
                点书名打开详情：已结束订单优先展示<strong className="text-foreground/80">下单时冻结的书目快照</strong>。
              </>
            ) : (
              <>
                点书名打开详情：进行中订单展示<strong className="text-foreground/80">当前链上书目</strong>。
              </>
            )}
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
        <p className="text-[11px]">
          <Link
            href={shelfMyEscrowTrades(order.asset, order.escrow_pda)}
            className="text-primary font-medium hover:underline"
          >
            本订单托管流水（仅该托管单）
          </Link>
        </p>
        {order.role === 'buyer' && order.state === 'Paid' && order.pre_ship_locked ? (
          <p className="text-[11px] text-amber-500/95 pt-0.5">
            卖家已锁单备发货：您暂不可修改收货地址，且不能取消订单，如有需求可与卖家联系。
          </p>
        ) : null}
        {order.role === 'seller' && order.state === 'Paid' && order.pre_ship_locked ? (
          <p className="text-[11px] text-muted-foreground pt-0.5">
            已锁单备发货（链上）：买家不可链上取消；您仍可取消或继续发货。
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {sellerPaidShipSlot && (
            <Button
              type="button"
              disabled={
                submittingId === `${order.escrow_pda}:prelock` ||
                submittingId === `${order.escrow_pda}:ship`
              }
              onClick={() => {
                if (!order.pre_ship_locked) {
                  void runPreShipLock(order)
                } else {
                  setShipDialogOrder(order)
                  setShipTrackingNo('')
                }
              }}
              variant="outline"
              className={
                order.pre_ship_locked
                  ? 'h-10 px-4 text-sm border-primary/40 text-primary'
                  : 'h-10 px-4 text-sm border-amber-500/50 text-amber-600 dark:text-amber-400'
              }
            >
              {!order.pre_ship_locked
                ? submittingId === `${order.escrow_pda}:prelock`
                  ? '提交中...'
                  : '锁单备发货'
                : submittingId === `${order.escrow_pda}:ship`
                  ? '提交中...'
                  : '确认发货'}
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
              onClick={() => {
                setDisputeFormErr(null)
                setDisputeFormStep('edit')
                setDisputePrivacyAck(false)
                setOnlyPostMaterial(false)
                setDisputePublicText('')
                setDisputePrivateText('')
                setDisputeTrackingNo('')
                setDisputeEvidenceFiles([])
                setDisputeFormOrder(order)
              }}
              variant="outline"
              className="h-10 px-4 text-sm border-destructive/40 text-destructive"
            >
              {submittingId === `${order.escrow_pda}:dispute` ? '提交中...' : '申请仲裁'}
            </Button>
          )}
          {order.role === 'buyer' &&
            order.state === 'Paid' && (
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4 text-sm"
                disabled={Boolean(order.pre_ship_locked)}
                onClick={() => {
                  if (order.pre_ship_locked) return
                  setChangeAddrErr(null)
                  setChangeAddressOrder(order)
                }}
              >
                {order.pre_ship_locked ? '已锁单不可改址' : '请求更改地址'}
              </Button>
            )}
        </div>
        {order.state === 'Disputed' ? (
          <div className="border-t border-border pt-2.5 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-snug">{disputeDeadlineNote(order)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                disabled={!apiConfigured || !isAuthenticated || !walletPk}
                onClick={() => setDisputeMaterialView({ order, scope: 'mine' })}
              >
                查看我方提交
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                disabled={!apiConfigured || !isAuthenticated || !walletPk}
                onClick={() => setDisputeMaterialView({ order, scope: 'peer' })}
              >
                查看对方提交
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs border-primary/50 text-primary"
                disabled={!apiConfigured || !isAuthenticated || submittingId === `${order.escrow_pda}:dispute`}
                onClick={() => {
                  setDisputeFormErr(null)
                  setDisputeFormStep('edit')
                  setDisputePrivacyAck(false)
                  setOnlyPostMaterial(true)
                  setDisputePublicText('')
                  setDisputePrivateText('')
                  setDisputeTrackingNo('')
                  setDisputeEvidenceFiles([])
                  setDisputeFormOrder(order)
                }}
              >
                提交/更新我方材料
              </Button>
            </div>
          </div>
        ) : null}
        {order.state === 'Released' ? (
          <div className="border-t border-border pt-2.5 flex flex-wrap items-center gap-2">
            {canSubmitReview ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4 text-sm border-primary/40 text-primary"
                onClick={() => {
                  setReviewOrder(order)
                  setReviewScore(5)
                  setReviewComment('')
                }}
              >
                评价对方
              </Button>
            ) : (
              <p className="text-[11px] text-muted-foreground">你已对本单提交过评价。</p>
            )}
          </div>
        ) : null}
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
                    : shippingPlainMap[order.escrow_pda]
                      ? '重新查看新收货地址'
                      : '查看收货地址'}
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
                {(() => {
                  const parsed = parseShippingPlaintext(shippingPlaintext)
                  if (!parsed.name && !parsed.phone && !parsed.address) {
                    return shippingPlaintext
                  }
                  return (
                    <div className="space-y-1">
                      <p>
                        姓名：<span className="text-foreground/95">{parsed.name ?? '—'}</span>
                      </p>
                      <p>
                        手机号：<span className="text-foreground/95">{parsed.phone ?? '—'}</span>
                      </p>
                      <p>
                        地址：<span className="text-foreground/95">{parsed.address ?? '—'}</span>
                      </p>
                    </div>
                  )
                })()}
              </div>
            ) : null}
            {shippingError ? <p className="text-xs text-destructive">{shippingError}</p> : null}
          </div>
        ) : null}
        {canViewTracking ? (
          <div className="border-t border-border pt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">物流单号（端到端加密）</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void handleDecryptTracking(order)
                }}
                disabled={decryptingTrackingOrder === order.escrow_pda}
              >
                {decryptingTrackingOrder === order.escrow_pda
                  ? '读取中...'
                  : trackingVisible
                    ? '隐藏单号'
                    : '查看单号'}
              </Button>
            </div>
            {trackingPlaintext && trackingVisible ? (
              <div className="rounded-md bg-secondary/50 px-2.5 py-2 text-xs text-foreground">
                <div className="mb-1 flex items-center justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(trackingPlaintext)
                        notify('物流单号已复制')
                      } catch {
                        notify('复制失败，请手动复制', 'error')
                      }
                    }}
                  >
                    复制
                  </Button>
                </div>
                <p className="font-mono text-foreground/95 break-all">{trackingPlaintext}</p>
              </div>
            ) : null}
            {trackingError ? <p className="text-xs text-destructive">{trackingError}</p> : null}
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

        {isAuthenticated && user?.pubkey && isArbitratorPubkey(user.pubkey) ? (
          <div className="mb-4 flex justify-end">
            <Link
              href={routes.arbitration}
              className="text-xs font-medium text-primary hover:underline"
            >
              仲裁工作台
            </Link>
          </div>
        ) : null}

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
        open={Boolean(disputeFormOrder)}
        onOpenChange={(open) => {
          if (!open && submittingId !== `${disputeFormOrder?.escrow_pda ?? ''}:dispute`) {
            setDisputeFormOrder(null)
            setOnlyPostMaterial(false)
            setDisputeFormStep('edit')
            setDisputePrivacyAck(false)
            setDisputeFormErr(null)
            setDisputePublicText('')
            setDisputePrivateText('')
            setDisputeTrackingNo('')
            setDisputeEvidenceFiles([])
            setDisputeImageLightboxUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-[min(92vw,520px)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {disputeFormStep === 'review'
                ? onlyPostMaterial
                  ? '确认保存材料'
                  : '确认申请仲裁'
                : onlyPostMaterial
                  ? '提交/更新我方材料'
                  : '申请仲裁'}
            </DialogTitle>
            <DialogDescription className="text-xs text-left leading-relaxed text-muted-foreground">
              {disputeFormStep === 'review' ? (
                <span className="block">
                  请核对公开说明与公开凭证图；确认后将{onlyPostMaterial ? '保存你方材料' : '上传图片并发起链上仲裁'}。仅仲裁员可见项不会在「查看对方提交」中向对方展示。
                </span>
              ) : onlyPostMaterial ? (
                <span className="block">
                  本单已在链上进入仲裁。此处<strong>仅保存或更新</strong>你方链下材料（公开说明、图、仅仲裁员项），<strong>无需</strong>再次钱包签名链上交易。每次保存会<strong>追加一版历史</strong>，可在「查看我方提交」中按第 1、2…次查阅。
                </span>
              ) : (
                <span className="block">
                  本仲裁材料仅<strong>订单买卖双方</strong>与<strong>仲裁员</strong>可见。您提交后，对方可查看公开说明与公开凭证图；仲裁员遵循保密义务处理仅仲裁员可见内容，不泄露您的隐私。
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {disputeFormOrder && disputeFormStep === 'review' ? (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">公开说明</p>
                <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-muted/25 px-2.5 py-2 text-sm whitespace-pre-wrap">
                  {disputePublicText.trim()}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">仅仲裁员可见补充说明</p>
                <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-muted/25 px-2.5 py-2 text-sm whitespace-pre-wrap">
                  {disputePrivateText.trim() ? disputePrivateText.trim() : '（未填写）'}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">物流单号（仅仲裁员可见）</p>
                <p className="rounded-md border border-border bg-muted/25 px-2.5 py-2 text-sm font-mono break-all">
                  {disputeTrackingNo.trim() ? disputeTrackingNo.trim() : '（未填写）'}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  公开凭证图（{disputeEvidenceFiles.length} / {DISPUTE_MAX_EVIDENCE_IMAGES}）
                </p>
                {disputeEvidencePreviewUrls.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {disputeEvidenceFiles.map((f, i) => (
                      <button
                        key={`${i}-${disputeFileKey(f)}`}
                        type="button"
                        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setDisputeImageLightboxUrl(disputeEvidencePreviewUrls[i])}
                        aria-label="放大查看预览图"
                      >
                        <img
                          src={disputeEvidencePreviewUrls[i]}
                          alt={f.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          放大
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">（未上传图片）</p>
                )}
              </div>
              <div className="rounded-lg border-2 border-primary/80 bg-card px-3 py-3 shadow-sm ring-1 ring-primary/20 dark:border-primary/70 dark:ring-primary/30">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="dispute-privacy-ack"
                    checked={disputePrivacyAck}
                    onCheckedChange={(c) => setDisputePrivacyAck(c === true)}
                    className="mt-0.5 size-5 min-h-5 min-w-5 shrink-0 rounded-[5px] border-2 border-primary shadow-sm data-[state=checked]:border-primary [&_svg]:size-4"
                  />
                  <label
                    htmlFor="dispute-privacy-ack"
                    className="text-sm leading-relaxed cursor-pointer text-foreground select-none"
                  >
                    我已认真阅读上方预览并确认：公开说明与公开凭证图中不含不当隐私；物流面单等敏感信息仅通过本页「仅仲裁员可见」项提交，未放入公开说明，也未放入公开图中。若违反，我愿自行承担后果。
                  </label>
                </div>
              </div>
              {disputeFormErr ? <p className="text-xs text-destructive">{disputeFormErr}</p> : null}
            </div>
          ) : disputeFormOrder ? (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label htmlFor="dispute-public">公开说明（必填）</Label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  对方可在本页「查看对方提交」查看；不含物流单号（单号见下方仅仲裁员项）。
                </p>
                <Textarea
                  id="dispute-public"
                  value={disputePublicText}
                  onChange={(e) => setDisputePublicText(e.target.value)}
                  placeholder="简述争议事实、诉求等"
                  rows={5}
                  className="resize-y min-h-[100px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dispute-private">仅仲裁员可见补充说明（选填）</Label>
                <Textarea
                  id="dispute-private"
                  value={disputePrivateText}
                  onChange={(e) => setDisputePrivateText(e.target.value)}
                  placeholder="不宜向对方公开的补充说明"
                  rows={3}
                  className="resize-y min-h-[72px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dispute-tracking">物流单号（选填，仅仲裁员可见）</Label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  将加密传输（HTTPS）。本项仅仲裁员可读，不写入公开说明；对方在「查看对方提交」中不可见。
                </p>
                <Input
                  id="dispute-tracking"
                  value={disputeTrackingNo}
                  onChange={(e) => setDisputeTrackingNo(e.target.value)}
                  placeholder="例如 SF1234567890"
                  maxLength={128}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dispute-files">公开凭证图（选填，至多 7 张）</Label>
                <p className="text-[11px] text-amber-800 dark:text-amber-200/95 leading-snug rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5">
                  请勿上传与仲裁无关的内容，或与您的隐私相关的信息及<strong>物流面单/物流截图</strong>等（物流单号请填上方仅仲裁员项）。
                </p>
                <Input
                  id="dispute-files"
                  type="file"
                  accept="image/*"
                  multiple
                  className="cursor-pointer text-xs"
                  onChange={(e) => {
                    const picked = e.target.files ? Array.from(e.target.files) : []
                    setDisputeEvidenceFiles((prev) => mergeDisputeEvidenceFiles(prev, picked))
                    e.target.value = ''
                  }}
                />
                {disputeEvidenceFiles.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    已选 {disputeEvidenceFiles.length} / {DISPUTE_MAX_EVIDENCE_IMAGES} 张
                  </p>
                ) : null}
                {disputeEvidencePreviewUrls.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                    {disputeEvidenceFiles.map((f, i) => (
                      <div
                        key={`${i}-${disputeFileKey(f)}`}
                        className="flex flex-col overflow-hidden rounded-md border border-border bg-muted"
                      >
                        <div className="relative aspect-square w-full shrink-0 group">
                          <button
                            type="button"
                            className="absolute inset-0 z-0 block h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md"
                            onClick={() => setDisputeImageLightboxUrl(disputeEvidencePreviewUrls[i])}
                            aria-label="放大查看"
                          >
                            <img
                              src={disputeEvidencePreviewUrls[i]}
                              alt={f.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                            />
                            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                              放大
                            </span>
                          </button>
                        </div>
                        <button
                          type="button"
                          className="w-full py-1 text-center text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-destructive border-t border-border"
                          onClick={() => setDisputeEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {disputeFormErr ? <p className="text-xs text-destructive">{disputeFormErr}</p> : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {disputeFormStep === 'review' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submittingId === `${disputeFormOrder?.escrow_pda ?? ''}:dispute`}
                  onClick={() => {
                    setDisputeFormErr(null)
                    setDisputeFormStep('edit')
                  }}
                >
                  返回修改
                </Button>
                <Button
                  type="button"
                  disabled={
                    !disputeFormOrder ||
                    submittingId === `${disputeFormOrder.escrow_pda}:dispute` ||
                    !isAuthenticated ||
                    !apiConfigured ||
                    !disputePrivacyAck
                  }
                  onClick={() => void confirmDisputeSubmit()}
                >
                  {disputeFormOrder && submittingId === `${disputeFormOrder.escrow_pda}:dispute`
                    ? onlyPostMaterial
                      ? '保存中…'
                      : '上传并签名中…'
                    : onlyPostMaterial
                      ? '确认保存材料'
                      : '确认并上传、链上申请仲裁'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submittingId === `${disputeFormOrder?.escrow_pda ?? ''}:dispute`}
                  onClick={() => {
                    setDisputeFormOrder(null)
                    setOnlyPostMaterial(false)
                    setDisputeFormStep('edit')
                    setDisputePrivacyAck(false)
                    setDisputeFormErr(null)
                    setDisputePublicText('')
                    setDisputePrivateText('')
                    setDisputeTrackingNo('')
                    setDisputeEvidenceFiles([])
                    setDisputeImageLightboxUrl(null)
                  }}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={
                    !disputeFormOrder ||
                    submittingId === `${disputeFormOrder.escrow_pda}:dispute` ||
                    !isAuthenticated ||
                    !apiConfigured
                  }
                  onClick={() => goDisputeReviewStep()}
                >
                  下一步
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(disputeMaterialView)}
        onOpenChange={(open) => {
          if (!open) {
            setDisputeMaterialView(null)
            setDisputeImageLightboxUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-[min(92vw,520px)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {disputeMaterialView?.scope === 'peer' ? '对方公开材料' : '我方仲裁材料'}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {disputeMaterialView?.scope === 'peer' ? (
                <>
                  以下为<strong>对方</strong>历次保存中的<strong>公开说明与公开图</strong>（不含仅仲裁员项）。
                </>
              ) : (
                <>
                  以下为<strong>你方</strong>历次保存；含<strong>仅仲裁员可见</strong>的补充说明与物流单号，便于核对。
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {disputeMaterialLoading ? (
            <p className="text-sm text-muted-foreground py-4">加载中…</p>
          ) : disputeMaterialErr ? (
            <p className="text-sm text-destructive py-2">{disputeMaterialErr}</p>
          ) : disputeMaterialData && disputeMaterialView ? (
            (() => {
              const matView = disputeMaterialView
              const materialScope = matView.scope
              const walletT = walletPk?.trim() ?? ''
              const ord = matView.order
              const peerPub = ord.role === 'buyer' ? ord.seller.trim() : ord.buyer.trim()
              const revs = disputeMaterialData.revisions
              const list: DisputeSubmissionRevision[] =
                materialScope === 'mine'
                  ? revs.filter((r) => r.initiator.trim() === walletT)
                  : revs.filter((r) => r.initiator.trim() === peerPub)
              const sorted = [...list].sort((a, b) => {
                if (a.revision_index !== b.revision_index) return a.revision_index - b.revision_index
                return a.created_at - b.created_at
              })
              const mineSub = disputeMaterialData.submissions.find((s) => s.initiator.trim() === walletT)
              const peerSub = disputeMaterialData.submissions.find((s) => s.initiator.trim() === peerPub)
              const fallbackSub = materialScope === 'mine' ? mineSub : peerSub

              function renderOneRevisionCard(rev: DisputeSubmissionRevision, idxLabel: string) {
                const privRaw = rev.private_text != null ? String(rev.private_text) : ''
                const { supplementary: privNotes, trackingNumber: privTracking } = splitDisputePrivateText(privRaw)
                const showPrivateMine =
                  materialScope === 'mine' &&
                  (privNotes.length > 0 || (privTracking != null && privTracking.length > 0))
                return (
                  <div key={rev.id} className="rounded-lg border border-border/70 p-3 space-y-2 bg-card/50">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{idxLabel}</span>
                      <span className="mx-1">·</span>
                      <span className="tabular-nums">
                        {new Date(rev.created_at * 1000).toLocaleString('zh-CN')}
                      </span>
                    </p>
                    <div className="rounded-md border border-border/60 bg-secondary/20 p-2.5">
                      <p className="text-[11px] text-muted-foreground mb-1">公开说明</p>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{rev.public_text}</p>
                    </div>
                    {parseDisputeAttachmentUrls(rev.public_attachment_urls).length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">公开凭证图</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {parseDisputeAttachmentUrls(rev.public_attachment_urls).map((u) => (
                            <button
                              key={`${rev.id}-${u}`}
                              type="button"
                              className="group relative block aspect-square overflow-hidden rounded-md border border-border bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setDisputeImageLightboxUrl(u)}
                              aria-label="放大查看凭证图"
                            >
                              <img
                                src={u}
                                alt=""
                                className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                                loading="lazy"
                              />
                              <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                                放大
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {showPrivateMine ? (
                      <div className="space-y-2 rounded-md border border-amber-500/35 bg-amber-500/10 p-2.5">
                        <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100">
                          仅仲裁员可见（你与仲裁员可读，对方不可见）
                        </p>
                        {privNotes.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">补充说明</p>
                            <p className="text-sm whitespace-pre-wrap text-foreground">{privNotes}</p>
                          </div>
                        ) : null}
                        {privTracking != null && privTracking.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">物流单号</p>
                            <p className="text-sm font-mono break-all text-foreground">{privTracking}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              }

              if (sorted.length > 0) {
                return (
                  <div className="space-y-5 text-sm">
                    {sorted.map((rev) => renderOneRevisionCard(rev, `第 ${rev.revision_index} 次提交`))}
                  </div>
                )
              }

              if (fallbackSub) {
                const pseudo: DisputeSubmissionRevision = {
                  id: -1,
                  revision_index: 1,
                  initiator: fallbackSub.initiator,
                  public_text: fallbackSub.public_text,
                  public_attachment_urls: fallbackSub.public_attachment_urls,
                  created_at: fallbackSub.created_at,
                  private_text: fallbackSub.private_text,
                }
                return (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs text-muted-foreground">当前保存的版本（尚无多版本历史记录）</p>
                    {renderOneRevisionCard(pseudo, '当前版本')}
                  </div>
                )
              }

              return (
                <p className="text-sm text-muted-foreground py-2">
                  {materialScope === 'mine' ? '你尚未保存链下材料。' : '对方尚未保存公开材料。'}
                </p>
              )
            })()
          ) : (
            <p className="text-sm text-muted-foreground">无数据</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisputeMaterialView(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageLightboxDialog
        open={disputeImageLightboxUrl != null}
        url={disputeImageLightboxUrl}
        onOpenChange={(open) => {
          if (!open) setDisputeImageLightboxUrl(null)
        }}
        title="图片预览"
      />

      <Dialog
        open={Boolean(changeAddressOrder)}
        onOpenChange={(open) => {
          if (!open) setChangeAddressOrder(null)
        }}
      >
        <DialogContent className="max-w-[min(92vw,560px)] max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>请求更改收货地址</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              地址将加密,仅你和卖家可见
            </DialogDescription>
          </DialogHeader>
          {changeAddrLoading ? (
            <p className="text-sm text-muted-foreground">加载收货地址…</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-border/60 bg-secondary/20 px-2.5 py-2">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">本单托管</p>
                <p className="font-mono text-xs text-foreground">
                  {changeAddressOrder ? shortenPubkey(changeAddressOrder.escrow_pda) : ''}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">选用收货地址</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    disabled={
                      changeAddrSavingNew ||
                      changeAddrSubmitting ||
                      !isAuthenticated ||
                      !apiConfigured
                    }
                    onClick={() => {
                      if (!isAuthenticated || !apiConfigured) {
                        notify('请先登录后再新增地址', 'error')
                        return
                      }
                      setChangeAddrErr(null)
                      setChangeAddrFormMode('create')
                    }}
                  >
                    新增地址
                  </Button>
                </div>
                {changeAddrAddresses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    暂无已保存的收货地址，请点击「新增地址」填写并保存（与个人中心一致）。
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                    {changeAddrAddresses.map((a) => (
                      <label
                        key={a.id}
                        className={[
                          'flex cursor-pointer gap-2 rounded-lg border px-2 py-2 text-xs',
                          changeAddrPickId === a.id ? 'border-primary bg-primary/5' : 'border-border',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          name="pending-ship-addr"
                          className="mt-1"
                          checked={changeAddrPickId === a.id}
                          onChange={() => setChangeAddrPickId(a.id)}
                        />
                        <span>
                          <span className="font-medium text-foreground">{a.label}</span>
                          <span className="block text-muted-foreground mt-0.5">
                            {formatShippingAddressPlaintext(a)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {changeAddrFormMode === 'create' ? (
                  <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">新增地址</p>
                    <input
                      value={caLabel}
                      onChange={(e) => setCaLabel(e.target.value)}
                      placeholder="地址标签（如：家 / 公司）"
                      className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                    />
                    <input
                      value={caName}
                      onChange={(e) => setCaName(e.target.value)}
                      placeholder="收件人姓名"
                      className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                    />
                    <input
                      value={caPhone}
                      onChange={(e) => setCaPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="手机号（11位）"
                      className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={caProvinceCode}
                        onChange={(e) => {
                          setCaProvinceCode(e.target.value)
                          setCaCityCode('')
                          setCaDistrictCode('')
                        }}
                        className="h-9 rounded-md bg-input border border-border px-1.5 text-[11px]"
                      >
                        <option value="">省</option>
                        {provinceOptions.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={caCityCode}
                        onChange={(e) => {
                          setCaCityCode(e.target.value)
                          setCaDistrictCode('')
                        }}
                        className="h-9 rounded-md bg-input border border-border px-1.5 text-[11px]"
                        disabled={!caProvinceCode}
                      >
                        <option value="">市</option>
                        {caCityOptions.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={caDistrictCode}
                        onChange={(e) => setCaDistrictCode(e.target.value)}
                        className="h-9 rounded-md bg-input border border-border px-1.5 text-[11px]"
                        disabled={!caCityCode}
                      >
                        <option value="">区/县</option>
                        {caDistrictOptions.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      rows={3}
                      value={caDetail}
                      onChange={(e) => setCaDetail(e.target.value)}
                      placeholder="详细地址（街道、门牌、楼栋、房号）"
                      className="w-full rounded-md bg-input border border-border px-2 py-1.5 text-xs"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          changeAddrSavingNew ||
                          !caName.trim() ||
                          !/^\d{11}$/.test(caPhone.trim()) ||
                          !caProvinceCode ||
                          !caCityCode ||
                          !caDistrictCode ||
                          !caDetail.trim()
                        }
                        onClick={() => void saveNewChangeAddrInDialog()}
                      >
                        {changeAddrSavingNew ? '保存中…' : '保存地址'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={changeAddrSavingNew}
                        onClick={() => {
                          setChangeAddrFormMode('hidden')
                          resetCaFields()
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              {changeAddrErr ? <p className="text-xs text-destructive">{changeAddrErr}</p> : null}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setChangeAddressOrder(null)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={
                changeAddrSubmitting ||
                changeAddrSavingNew ||
                changeAddrLoading ||
                !changeAddrPickId ||
                changeAddrAddresses.length === 0
              }
              onClick={() => void submitChangeShippingAddress()}
            >
              {changeAddrSubmitting ? '提交中…' : '加密并同步到订单'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogDescription>请认真核对确保物流单号无误，这将会展示给买家查看。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
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
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 px-3 text-xs"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    const filtered = text.replace(/[^A-Za-z0-9-]/g, '')
                    setShipTrackingNo(filtered)
                    setShipTrackingError(null)
                  } catch {
                    notify('读取剪贴板失败，请手动粘贴', 'error')
                  }
                }}
              >
                粘贴
              </Button>
            </div>
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
              请认真核对确保物流单号无误，这将会展示给买家查看。
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

      <Dialog
        open={Boolean(reviewOrder)}
        onOpenChange={(open) => {
          if (!open && !reviewSubmitting) setReviewOrder(null)
        }}
      >
        <DialogContent className="max-w-[min(92vw,420px)]">
          <DialogHeader>
            <DialogTitle>评价本次交易</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground leading-relaxed">
                {reviewOrder ? (
                  <>
                    订单{' '}
                    <span className="font-mono text-foreground">{shortenPubkey(reviewOrder.escrow_pda)}</span>
                    ，对象为{' '}
                    <Link
                      href={userPublicProfile(
                        reviewOrder.role === 'buyer' ? reviewOrder.seller : reviewOrder.buyer,
                      )}
                      className="text-primary underline-offset-2 hover:underline font-mono"
                    >
                      {shortenPubkey(reviewOrder.role === 'buyer' ? reviewOrder.seller : reviewOrder.buyer)}
                    </Link>
                    。同一笔托管每人仅可提交一条评价。
                  </>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">星级（1～5）</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={reviewScore === n ? 'default' : 'outline'}
                    className="min-w-10"
                    disabled={reviewSubmitting}
                    onClick={() => setReviewScore(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">文字评价（可选）</p>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="物流、品相、沟通等（最多约 2000 字）"
                rows={4}
                disabled={reviewSubmitting}
                className="resize-y min-h-[96px]"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={reviewSubmitting}
                onClick={() => setReviewOrder(null)}
              >
                取消
              </Button>
              <Button type="button" disabled={reviewSubmitting} onClick={() => void handleSubmitReview()}>
                {reviewSubmitting ? '提交中…' : '提交评价'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {notice ? (
        <div
          className={[
            'fixed left-1/2 top-1/2 z-[120] w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg px-4 py-3 text-center text-sm md:text-base shadow-md border',
            notice.tone === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : notice.tone === 'success'
                ? 'border-primary/30 bg-primary/12 text-primary'
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
