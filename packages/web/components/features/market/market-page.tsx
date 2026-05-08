'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import type { Book } from '@/lib/types'
import { useBookCategories } from '@/lib/hooks/use-book-categories'
import { useBookConditions } from '@/lib/hooks/use-book-conditions'
import { useMarketBooks } from '@/lib/hooks/use-market-books'
import { Button } from '@/components/ui/button'
import { Loader2, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { chatWithPeer } from '@/config/routes'
import { fetchBookDetail, type BookDetailResponse } from '@/lib/api/book-detail'
import { buildCreateEscrow, broadcastCreateEscrowAuto, signEscrowTxWithWallet } from '@/lib/api/escrow'
import { fetchUserEncryptionPublicKey } from '@/lib/api/encryption'
import { upsertOrderShippingCipherByAsset } from '@/lib/api/shipping-cipher'
import { fetchMyShippingAddresses, type ShippingAddressPayload } from '@/lib/api/shipping-addresses'

const SORT_OPTIONS = [
  { label: '最新上架', value: 'newest' as const },
  { label: '价格从低到高', value: 'price_asc' as const },
  { label: '价格从高到低', value: 'price_desc' as const },
  { label: '收藏最多', value: 'favorites' as const },
]

interface BuyModalProps {
  book: Book
  onClose: () => void
  onPurchased?: () => void
}

interface DetailPanelProps {
  asset: string
  onClose: () => void
  onBuy?: (book: Book) => void
}

function formatBuyErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const normalized = raw.toLowerCase()

  if (
    normalized.includes('attempt to debit an account') ||
    normalized.includes('insufficient') ||
    normalized.includes('insufficient funds') ||
    normalized.includes('no record of a prior credit')
  ) {
    return '余额不足，无法完成购买。请先补充 SOL 后重试。'
  }
  if (
    normalized.includes('user rejected') ||
    normalized.includes('rejected') ||
    normalized.includes('declined') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled')
  ) {
    return '你已取消钱包签名，本次购买未提交。'
  }
  if (
    normalized.includes('blockhash not found') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('node is behind') ||
    normalized.includes('rpc')
  ) {
    return '链上网络繁忙或连接异常，请稍后重试。'
  }
  if (
    normalized.includes('system_program is not set') ||
    normalized.includes('program failed to complete') ||
    normalized.includes('sbf program panicked') ||
    normalized.includes('bad gateway') ||
    normalized.includes(' 502')
  ) {
    return '购买请求已签名，但服务端处理交易时发生异常。请稍后重试或联系管理员排查后端配置。'
  }

  return '购买失败，请稍后重试。'
}

type ShippingAddress = {
  id: string
  label: string
  name: string
  phone?: string
  region: string
  provinceCode: string
  cityCode: string
  districtCode: string
  detail: string
}

type DecryptedShippingAddress = Omit<ShippingAddress, 'id'> & { id?: string }
type ShippingProfileStore = {
  addresses: ShippingAddress[]
  defaultId: string | null
}

// ─── Buy Modal (unchanged) ────────────────────────────────────────────────────

function BuyModal({ book, onClose, onPurchased }: BuyModalProps) {
  const { publicKey, signTransaction } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [step, setStep] = useState<'confirm' | 'address' | 'signing' | 'done'>('confirm')
  const [shippingPlaintext, setShippingPlaintext] = useState('')
  const [dbShippingAddresses, setDbShippingAddresses] = useState<ShippingAddress[]>([])
  const [selectedDbAddressId, setSelectedDbAddressId] = useState<string | null>(null)
  const [defaultShippingPlaintext, setDefaultShippingPlaintext] = useState('')
  const [addressSource, setAddressSource] = useState<'default' | 'manual'>('manual')
  const [addressSaving, setAddressSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cancelHintOpen, setCancelHintOpen] = useState(false)

  useEffect(() => {
    if (!cancelHintOpen) return
    const timer = window.setTimeout(() => setCancelHintOpen(false), 3000)
    return () => window.clearTimeout(timer)
  }, [cancelHintOpen])

  function parseLocalShippingProfile(pubkey: string): ShippingProfileStore {
    const raw = localStorage.getItem(`bookchain:shipping-profile:${pubkey}`)
    if (!raw) return { addresses: [], defaultId: null }
    try {
      const parsed = JSON.parse(raw) as {
        addresses?: ShippingAddress[]
        defaultId?: string | null
        name?: string
        phone?: string
        region?: string
        provinceCode?: string
        cityCode?: string
        districtCode?: string
        detail?: string
      }
      if (Array.isArray(parsed.addresses) && parsed.addresses.length > 0) {
        const addresses = parsed.addresses
          .filter((item) => Boolean(item?.id && item?.name && item?.detail && (item?.region || item?.provinceCode)))
          .map((item) => ({
            ...item,
            region: item.region ?? '',
            provinceCode: item.provinceCode ?? '',
            cityCode: item.cityCode ?? '',
            districtCode: item.districtCode ?? '',
            phone: item.phone ?? '',
          }))
        const defaultId = addresses.some((x) => x.id === parsed.defaultId)
          ? (parsed.defaultId ?? null)
          : (addresses[0]?.id ?? null)
        return { addresses, defaultId }
      }
      if (
        parsed.name &&
        parsed.provinceCode &&
        parsed.cityCode &&
        parsed.districtCode &&
        parsed.detail
      ) {
        const legacy: ShippingAddress = {
          id: 'legacy-default',
          label: '默认地址',
          name: parsed.name,
          phone: parsed.phone ?? '',
          region: parsed.region ?? '',
          provinceCode: parsed.provinceCode,
          cityCode: parsed.cityCode,
          districtCode: parsed.districtCode,
          detail: parsed.detail,
        }
        return { addresses: [legacy], defaultId: legacy.id }
      }
      return { addresses: [], defaultId: null }
    } catch {
      return { addresses: [], defaultId: null }
    }
  }

  function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  function base64ToBytes(base64: string) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  async function sha256(data: Uint8Array) {
    const view = new Uint8Array(data)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', view))
  }

  async function loadLocalCommPrivateKey(pubkey: string) {
    const key = localStorage.getItem(`bookchain:comm-key:${pubkey}`)
    if (!key) return null
    return crypto.subtle.importKey('pkcs8', base64ToBytes(key), { name: 'X25519' } as EcKeyImportParams, false, ['deriveBits'])
  }

  async function decryptShippingForMe(payload: ShippingAddressPayload, pubkey: string) {
    const key = await loadLocalCommPrivateKey(pubkey)
    if (!key) throw new Error('本地通讯私钥不存在，请先在个人中心恢复后再试')
    const parsed = JSON.parse(payload.buyer_ciphertext) as { epk: string; ct: string }
    const ephPub = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(parsed.epk),
      { name: 'X25519' } as EcKeyImportParams,
      false,
      [],
    )
    const shared = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'X25519', public: ephPub } as EcdhKeyDeriveParams,
      key,
      256,
    ))
    const iv = base64ToBytes(payload.buyer_nonce)
    const keySeed = new Uint8Array(shared.length + iv.length)
    keySeed.set(shared, 0)
    keySeed.set(iv, shared.length)
    const aesRaw = await sha256(keySeed)
    const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt'])
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, base64ToBytes(parsed.ct))
    const decoded = JSON.parse(new TextDecoder().decode(plain)) as DecryptedShippingAddress
    return {
      id: String(payload.id),
      label: decoded.label ?? '默认地址',
      name: decoded.name ?? '',
      phone: decoded.phone ?? '',
      region: decoded.region ?? '',
      provinceCode: decoded.provinceCode ?? '',
      cityCode: decoded.cityCode ?? '',
      districtCode: decoded.districtCode ?? '',
      detail: decoded.detail ?? '',
    } satisfies ShippingAddress
  }

  function formatAddressPlaintext(addr: ShippingAddress) {
    return [addr.name, addr.phone, addr.region, addr.detail].filter(Boolean).join('，')
  }

  async function encryptShippingForSeller(sellerEncPubB64: string, plain: string) {
    const sellerPub = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(sellerEncPubB64),
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
      { name: 'X25519', public: sellerPub } as EcdhKeyDeriveParams,
      eph.privateKey,
      256,
    ))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const keySeed = new Uint8Array(shared.length + iv.length)
    keySeed.set(shared, 0)
    keySeed.set(iv, shared.length)
    const aesRaw = await sha256(keySeed)
    const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['encrypt'])
    const plainBytes = new TextEncoder().encode(plain)
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new Uint8Array(plainBytes)),
    )
    const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
    return {
      seller_ciphertext: JSON.stringify({ epk: bytesToBase64(ephPub), ct: bytesToBase64(ct) }),
      seller_nonce: bytesToBase64(iv),
      seller_alg: 'x25519_aesgcm_v1',
    }
  }

  async function handleBuy() {
    if (!publicKey) {
      openWalletConnect()
      onClose()
      return
    }
    if (!signTransaction) {
      setErrorMsg('当前钱包不支持交易签名，请切换钱包后重试。')
      return
    }
    setErrorMsg(null)
    setStep('signing')
    try {
      const detail = await fetchBookDetail(book.id)
      const collection = (detail.book as BookDetailResponse['book'] & { collection?: string }).collection
      if (!collection) {
        throw new Error('缺少 collection 字段，暂时无法发起托管购买')
      }
      const built = await buildCreateEscrow({
        buyer: publicKey.toBase58(),
        seller: book.seller,
        asset: book.id,
        collection,
      })
      let signedTx = ''
      try {
        signedTx = await signEscrowTxWithWallet(built.tx, signTransaction)
      } catch {
        setStep('confirm')
        setCancelHintOpen(true)
        return
      }
      await broadcastCreateEscrowAuto({
        signed_tx: signedTx,
        asset: book.id,
        seller: book.seller,
        buyer: publicKey.toBase58(),
        price: Math.round(book.price * 1_000_000_000),
      })
      onPurchased?.()
      setStep('done')
    } catch (e) {
      console.error('[market-buy] purchase failed', e)
      setStep('address')
      setErrorMsg(formatBuyErrorMessage(e))
    }
  }

  async function handleSubmitAddressAndBuy() {
    if (!shippingPlaintext.trim()) return
    setAddressSaving(true)
    setErrorMsg(null)
    try {
      const sellerPub = await fetchUserEncryptionPublicKey(book.seller)
      if (!sellerPub.encryption_public_key?.trim()) {
        // 卖家未初始化加密能力时，不阻塞下单流程；保持静默下单避免打断
        await handleBuy()
        return
      }
      const encrypted = await encryptShippingForSeller(
        sellerPub.encryption_public_key,
        shippingPlaintext.trim(),
      )
      await upsertOrderShippingCipherByAsset(book.id, {
        ...encrypted,
        encryption_key_version: 'v1',
      })
      await handleBuy()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '收货地址提交失败')
    } finally {
      setAddressSaving(false)
    }
  }

  useEffect(() => {
    if (step !== 'address' || !publicKey) return
    let cancelled = false
    ;(async () => {
      const localProfile = parseLocalShippingProfile(publicKey.toBase58())
      if (cancelled) return
      if (localProfile.addresses.length > 0) {
        const current =
          localProfile.addresses.find((x) => x.id === localProfile.defaultId) ??
          localProfile.addresses[0]
        const plain = current ? formatAddressPlaintext(current) : ''
        setDbShippingAddresses(localProfile.addresses)
        setSelectedDbAddressId(current?.id ?? null)
        setDefaultShippingPlaintext(plain)
        setAddressSource('default')
        setShippingPlaintext(plain)
        return
      }
      try {
        const remote = await fetchMyShippingAddresses()
        if (cancelled) return
        if (remote.addresses.length > 0) {
          const decrypted = await Promise.all(
            remote.addresses.map((row) => decryptShippingForMe(row, publicKey.toBase58())),
          )
          if (cancelled) return
          const defaultRow = remote.addresses.find((x) => x.is_default)
          const resolvedDefaultId = String(defaultRow?.id ?? decrypted[0]?.id ?? '')
          const current =
            decrypted.find((x) => x.id === resolvedDefaultId) ??
            decrypted[0]
          const plain = current ? formatAddressPlaintext(current) : ''
          setDbShippingAddresses(decrypted)
          setSelectedDbAddressId(current?.id ?? null)
          setDefaultShippingPlaintext(plain)
          if (plain) {
            setAddressSource('default')
            setShippingPlaintext(plain)
          } else {
            setAddressSource('manual')
            setShippingPlaintext('')
          }
          return
        }
      } catch {
        // 远端地址读取失败时保留手动填写模式
      }
      if (cancelled) return
      setDbShippingAddresses([])
      setSelectedDbAddressId(null)
      setDefaultShippingPlaintext('')
      setAddressSource('manual')
      setShippingPlaintext('')
    })()
    return () => {
      cancelled = true
    }
  }, [step, publicKey])

  return (
      <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          onClick={onClose}
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
        <div
            className="relative z-10 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
        >
          {step === 'done' ? (
              <div className="flex flex-col items-center gap-4 py-5">
            <span className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M6 14l6 6 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
              </svg>
            </span>
                <p className="text-lg font-semibold text-foreground">下单成功！</p>
                <p className="text-sm text-muted-foreground text-center">订单已创建并进入托管，待卖家发货后你可确认收货完成最终交割。</p>
                <Button onClick={onClose} className="w-full h-11 text-base bg-primary text-primary-foreground rounded-lg">关闭</Button>
              </div>
          ) : step === 'address' ? (
              <>
                <h3 className="font-semibold text-lg text-foreground mb-4">确认收货地址（签名前）</h3>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={addressSource === 'default' ? 'default' : 'outline'}
                    disabled={!defaultShippingPlaintext || addressSaving}
                    onClick={() => {
                      setAddressSource('default')
                      setShippingPlaintext(defaultShippingPlaintext)
                    }}
                    className="h-10 text-sm rounded-lg"
                  >
                    使用已选地址
                  </Button>
                  <Button
                    type="button"
                    variant={addressSource === 'manual' ? 'default' : 'outline'}
                    disabled={addressSaving}
                    onClick={() => {
                      setAddressSource('manual')
                      if (shippingPlaintext === defaultShippingPlaintext) setShippingPlaintext('')
                    }}
                    className="h-10 text-sm rounded-lg"
                  >
                    手动填写新地址
                  </Button>
                </div>
                {!defaultShippingPlaintext ? (
                  <p className="mb-2 text-xs text-muted-foreground">未检测到默认地址，请直接填写新地址。</p>
                ) : null}
                {dbShippingAddresses.length > 0 ? (
                  <div className="mb-3 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                    <p className="mb-2 text-xs font-medium text-foreground">已保存地址（解密后本地展示）</p>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {dbShippingAddresses.map((item) => {
                        const plain = formatAddressPlaintext(item)
                        const active = selectedDbAddressId === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedDbAddressId(item.id)
                              setAddressSource('default')
                              setShippingPlaintext(plain)
                              setDefaultShippingPlaintext(plain)
                            }}
                            className={[
                              'w-full rounded-md border px-2 py-2 text-left text-xs transition-colors',
                              active
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground',
                            ].join(' ')}
                          >
                            <p className="font-medium text-foreground">{item.label || '地址'}</p>
                            <p className="mt-0.5 truncate">{plain}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {addressSource === 'manual' ? (
                  <textarea
                    value={shippingPlaintext}
                    onChange={(e) => setShippingPlaintext(e.target.value)}
                    placeholder="例如：张三，浙江省杭州市西湖区 xx 路 xx 号"
                    className="w-full min-h-36 rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
                  />
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  地址会在本地加密后再提交，后端仅保存密文。
                </p>
                {errorMsg ? <p className="mt-2 text-sm text-red-500">{errorMsg}</p> : null}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setErrorMsg(null)
                      setStep('confirm')
                    }}
                    className="flex-1 h-11 text-base border-border text-foreground rounded-lg"
                    disabled={addressSaving}
                  >
                    返回
                  </Button>
                  <Button
                    onClick={handleSubmitAddressAndBuy}
                    className="flex-1 h-11 text-base bg-primary text-primary-foreground rounded-lg"
                    disabled={addressSaving || !shippingPlaintext.trim()}
                  >
                    {addressSaving ? '处理中...' : '确认地址并签名购买'}
                  </Button>
                </div>
              </>
          ) : step === 'signing' ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-4">
                <span className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </span>
                <p className="text-lg font-semibold text-foreground">等待钱包签名...</p>
                <p className="text-sm text-muted-foreground text-center">
                  收货地址已加密确认，接下来请在钱包中确认购买签名。
                </p>
              </div>
          ) : (
              <div className="flex min-h-[500px] flex-col">
                <h3 className="font-semibold text-lg text-foreground mb-4">确认购买</h3>
                <div className="flex gap-4 mb-5">
                  <div className="relative w-20 h-28 rounded-lg overflow-hidden shrink-0">
                    <Image src={book.cover} alt={book.title} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base text-foreground break-words leading-6">{book.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{book.author}</p>
                    <p className="text-sm text-muted-foreground mt-2">Token ID: {book.tokenId}</p>
                    <p className="text-sm text-muted-foreground mt-1">品相: {book.condition}</p>
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-4 mb-6 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>书籍价格</span>
                    <span className="text-foreground font-mono text-base">{book.price} SOL</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>链上 Gas</span>
                    <span className="text-foreground font-mono">~0.000005 SOL</span>
                  </div>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1 h-11 text-base border-border text-foreground rounded-lg"
                  >
                    取消
                  </Button>
                  <Button
                      onClick={() => {
                        setErrorMsg(null)
                        setStep('address')
                      }}
                      className="flex-1 h-11 text-base bg-primary text-primary-foreground rounded-lg"
                  >
                    确认购买
                  </Button>
                </div>
                {errorMsg ? <p className="mt-3 text-sm text-red-500">{errorMsg}</p> : null}
              </div>
          )}
        </div>
        {cancelHintOpen ? (
          <div className="fixed top-20 left-1/2 z-[90] -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
            已取消操作
          </div>
        ) : null}
      </div>
  )
}

// ─── Book Detail Panel ────────────────────────────────────────────────────────
// 重构要点：
// 1. 整体改为右滑入的侧边面板（大屏）/ 底部全屏（移动端）
// 2. 左侧大图使用 flex 自适应，图片容器高度跟随内容区，不写死 vh
// 3. 缩略图横向滚动切换，支持键盘 ← → 翻图
// 4. 放大预览保持原有拖拽 & 滚轮缩放逻辑

function BookDetailPanel({ asset, onClose, onBuy }: DetailPanelProps) {
  const { publicKey } = useWallet()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<BookDetailResponse | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [bookDescription, setBookDescription] = useState<string>('暂无图书简介')

  // zoom state
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [zoomScale, setZoomScale] = useState(1)
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 })
  const [isDraggingZoom, setIsDraggingZoom] = useState(false)
  const [dragPointerId, setDragPointerId] = useState<number | null>(null)
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 })

  // 构造画廊列表：封面排第一
  const galleryImages = useMemo(() => {
    if (!detail) return []
    return [
      ...(detail.book.cover_url ? [{ id: -1, url: detail.book.cover_url, kind: 'cover' as const }] : []),
      ...detail.images.map((img) => ({ id: img.id, url: img.url, kind: 'detail' as const })),
    ]
  }, [detail])

  const activeImage = galleryImages[activeIndex] ?? null

  // 加载详情
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchBookDetail(asset)
        if (!cancelled) {
          setDetail(res)
          setActiveIndex(0)
        }
        try {
          const mdRes = await fetch(res.book.metadata_url)
          if (mdRes.ok) {
            const md = (await mdRes.json()) as { description?: string }
            const desc = md.description?.trim()
            if (!cancelled && desc) setBookDescription(desc)
          }
        } catch { /* metadata 失败时保留默认简介 */ }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '详情加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [asset])

  // 锁定 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // 键盘：Esc 关闭 / ← → 切图
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (zoomImage) {
        if (e.key === 'Escape') setZoomImage(null)
        return
      }
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setActiveIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setActiveIndex((i) => Math.min(galleryImages.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, zoomImage, galleryImages.length])

  // 重置 zoom 状态
  useEffect(() => {
    if (!zoomImage) {
      setIsDraggingZoom(false)
      setDragPointerId(null)
      setDragOrigin({ x: 0, y: 0 })
      setZoomScale(1)
      setZoomOffset({ x: 0, y: 0 })
    }
  }, [zoomImage])

  const statusLabelMap: Record<string, string> = {
    listed: '在售', sold: '已售出', pending: '处理中', draft: '草稿', unlisted: '已下架',
  }
  const statusLabel = detail?.book.status
      ? (statusLabelMap[detail.book.status.toLowerCase()] ?? detail.book.status)
      : '未知'
  const isOwner = detail != null && publicKey?.toBase58() === detail.book.seller

  return (
      <>
        {/* 遮罩 */}
        <div
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
        />

        {/*
        面板本体：
        - 移动端：从底部弹出，max-h-[96vh]
        - 桌面端：居中弹层，宽度 min(92vw,1200px)，高度 min(90vh,900px)，圆角
      */}
        <div
            className={[
              'fixed z-50 bg-card border border-border shadow-2xl',
              'flex flex-col',
              // 移动端：底部全屏
              'inset-x-0 bottom-0 rounded-t-2xl max-h-[96vh]',
              // 桌面端：居中
              'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
              'sm:rounded-2xl sm:w-[min(92vw,1200px)] sm:h-[min(90vh,900px)]',
              'animate-in slide-in-from-bottom sm:slide-in-from-bottom-4 duration-300',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
        >
          {/* ── 顶部栏 ── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <p className="text-sm font-semibold text-foreground">
              {loading ? '加载中…' : (detail?.book.name ?? '书籍详情')}
            </p>
            <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── 内容区 ── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
                <div className="flex items-center justify-center h-full py-20 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                </div>
            ) : error ? (
                <div className="flex items-center justify-center h-full py-20 text-sm text-destructive">{error}</div>
            ) : !detail ? (
                <div className="flex items-center justify-center h-full py-20 text-sm text-muted-foreground">未找到该书籍详情</div>
            ) : (
                /*
                  两列布局：
                  - 左：大图 + 缩略图横条（flex-col，图片自适应剩余高度）
                  - 右：书籍信息，可独立滚动
                  桌面端并排；移动端单列（图在上，信息在下）
                */
                <div className="flex flex-col lg:flex-row lg:h-full">

                  {/* ── 左列：图片区 ── */}
                  <div className="lg:w-[55%] lg:h-full flex flex-col border-b border-border lg:border-b-0 lg:border-r">

                    {/*
                  主图容器：
                  - 移动端：固定 aspect-ratio，让图片有合理高度
                  - 桌面端：flex-1 撑满剩余高度，不限死 px/vh
                */}
                    <div className="relative aspect-[4/3] lg:aspect-auto lg:flex-1 bg-secondary/50 overflow-hidden">
                      {activeImage ? (
                          <button
                              type="button"
                              className="absolute inset-0 group"
                              onClick={() => {
                                setZoomImage(activeImage.url)
                                setZoomScale(1)
                                setZoomOffset({ x: 0, y: 0 })
                              }}
                              aria-label="放大查看图片"
                          >
                            <Image
                                src={activeImage.url}
                                alt={detail.book.name}
                                fill
                                className="object-contain"
                                priority
                            />
                            {/* 放大提示角标 */}
                            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <ZoomIn size={12} /> 点击放大
                      </span>
                            {/* 封面 / 详情 标签 */}
                            <span className="absolute top-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[11px] text-white">
                        {activeImage.kind === 'cover' ? '封面' : '详情图'}
                      </span>
                          </button>
                      ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                            暂无图片
                          </div>
                      )}

                      {/* 左右切图箭头（仅在有多张图时显示） */}
                      {galleryImages.length > 1 && (
                          <>
                            <button
                                type="button"
                                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                                disabled={activeIndex === 0}
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/70 backdrop-blur text-foreground hover:bg-background/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="上一张"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveIndex((i) => Math.min(galleryImages.length - 1, i + 1))}
                                disabled={activeIndex === galleryImages.length - 1}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/70 backdrop-blur text-foreground hover:bg-background/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="下一张"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </>
                      )}
                    </div>

                    {/* 缩略图横条 */}
                    {galleryImages.length > 1 && (
                        <div className="shrink-0 px-3 py-2.5 border-t border-border bg-card/60">
                          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {galleryImages.map((img, idx) => (
                                <button
                                    type="button"
                                    key={img.id}
                                    onClick={() => setActiveIndex(idx)}
                                    className={[
                                      'relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-all',
                                      activeIndex === idx
                                          ? 'border-primary ring-2 ring-primary/30 scale-105'
                                          : 'border-transparent opacity-60 hover:opacity-90',
                                    ].join(' ')}
                                    aria-label={img.kind === 'cover' ? '封面' : `详情图 ${idx}`}
                                >
                                  <Image src={img.url} alt="" fill className="object-cover" />
                                  {img.kind === 'cover' && (
                                      <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white leading-tight">
                              封面
                            </span>
                                  )}
                                </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 text-right tabular-nums">
                            {activeIndex + 1} / {galleryImages.length}
                          </p>
                        </div>
                    )}
                  </div>

                  {/* ── 右列：书籍信息 ── */}
                  <div className="lg:w-[45%] lg:h-full lg:overflow-y-auto flex flex-col gap-5 p-5 sm:p-6">

                    {/* 书名 & 作者 */}
                    <div>
                      <h2 className="text-2xl font-bold text-foreground leading-snug">{detail.book.name}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {detail.book.author || '作者未知'}
                        {detail.book.series ? ` · ${detail.book.series}` : ''}
                      </p>
                    </div>

                    {/* 价格 & 状态 */}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">当前价格</p>
                        <p className="text-3xl font-mono font-bold text-primary">
                          {(detail.book.price / 1_000_000_000).toFixed(3)}
                          <span className="text-base font-semibold ml-1">SOL</span>
                        </p>
                        {typeof detail.book.price_cny === 'number' && detail.book.price_cny > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            ¥{detail.book.price_cny.toFixed(2)}
                            {typeof detail.book.fx_cny_per_sol === 'number' && detail.book.fx_cny_per_sol > 0
                              ? `（上架汇率 1 SOL≈¥${detail.book.fx_cny_per_sol.toFixed(2)}）`
                              : ''}
                          </p>
                        )}
                      </div>
                      <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
                    {statusLabel}
                  </span>
                    </div>

                    {/* 属性表格 */}
                    <div className="rounded-xl border border-border/60 overflow-hidden text-sm">
                      {[
                        { label: '分类', value: detail.book.category },
                        { label: '品相', value: detail.book.condition },
                        { label: '卖家地址', value: detail.book.seller, mono: true, truncate: true },
                        { label: 'Token ID', value: `#${detail.book.asset}`, mono: true, truncate: true },
                      ].map(({ label, value, mono, truncate }, i) => (
                          <div
                              key={label}
                              className={[
                                'flex items-start gap-3 px-4 py-2.5',
                                i % 2 === 0 ? 'bg-secondary/30' : 'bg-card',
                              ].join(' ')}
                          >
                            <span className="shrink-0 w-20 text-muted-foreground">{label}</span>
                            <span
                                className={[
                                  'flex-1 min-w-0 text-foreground font-medium',
                                  mono ? 'font-mono text-xs' : '',
                                  truncate ? 'truncate' : '',
                                ].join(' ')}
                                title={value}
                            >
                        {value}
                      </span>
                          </div>
                      ))}
                    </div>

                    {/* 图书简介 */}
                    <div className="rounded-xl bg-secondary/30 border border-border/40 p-4 flex-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">图书简介</p>
                      <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">
                        {bookDescription}
                      </p>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-col sm:flex-row gap-2.5 pb-2">
                      {isOwner ? (
                        <span className="h-10 w-full rounded-xl border border-border/60 bg-secondary/30 text-sm text-muted-foreground inline-flex items-center justify-center">
                          这是你发布的书籍
                        </span>
                      ) : (
                        <>
                          <Link
                              href={chatWithPeer(detail.book.seller)}
                              className="flex-1 inline-flex items-center justify-center h-10 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
                          >
                            联系卖家
                          </Link>
                          {onBuy && (
                              <Button
                                  className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90"
                                  onClick={() => {
                                    onBuy({
                                      id: detail.book.asset,
                                      title: detail.book.name,
                                      author: detail.book.author ?? '',
                                      cover: detail.book.cover_url ?? '',
                                      price: detail.book.price / 1_000_000_000,
                                      condition: detail.book.condition ?? '',
                                      category: detail.book.category ?? '',
                                      seller: detail.book.seller,
                                      sellerUsername: '',
                                      tokenId: detail.book.asset,
                                      favorites: 0,
                                      createdAt: '',
                                    } as unknown as Book)
                                  }}
                              >
                                立即购买
                              </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
            )}
          </div>
        </div>

        {/* ── 放大预览 Lightbox ── */}
        {zoomImage && (
            <div
                className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center"
                onWheel={(e) => {
                  e.stopPropagation()
                  const next = e.deltaY < 0 ? zoomScale + 0.15 : zoomScale - 0.15
                  setZoomScale(Math.max(0.5, Math.min(5, Number(next.toFixed(2)))))
                }}
            >
              {/* 操作栏 */}
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button
                    type="button"
                    className="rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80 transition-colors"
                    onClick={() => setZoomScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                >缩小</button>
                <button
                    type="button"
                    className="rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80 transition-colors"
                    onClick={() => setZoomScale((s) => Math.min(5, Number((s + 0.25).toFixed(2))))}
                >放大</button>
                <button
                    type="button"
                    className="rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80 transition-colors"
                    onClick={() => setZoomImage(null)}
                >关闭</button>
              </div>

              {/*
            关键结构：
            - 外层 overflow-hidden 容器：限制图片显示边界，点击空白关闭
            - 内层可拖动 div：承载 transform，捕获 pointer 事件
            - Image 填充内层
          */}
              <div
                  className="relative w-full h-full overflow-hidden"
                  onClick={() => {
                    // 只在没有拖动时点击才关闭
                    if (!isDraggingZoom) setZoomImage(null)
                  }}
              >
                <div
                    className={`absolute inset-0 touch-none ${isDraggingZoom ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{
                      transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
                      transformOrigin: 'center center',
                      userSelect: 'none',
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      e.stopPropagation()
                      setIsDraggingZoom(true)
                      setDragPointerId(e.pointerId)
                      setDragOrigin({ x: e.clientX - zoomOffset.x, y: e.clientY - zoomOffset.y })
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={(e) => {
                      if (!isDraggingZoom) return
                      if (dragPointerId !== e.pointerId) return
                      e.stopPropagation()
                      setZoomOffset({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y })
                    }}
                    onPointerUp={(e) => {
                      if (dragPointerId !== e.pointerId) return
                      setIsDraggingZoom(false)
                      setDragPointerId(null)
                    }}
                    onPointerCancel={() => {
                      setIsDraggingZoom(false)
                      setDragPointerId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                  <Image src={zoomImage} alt="书籍大图" fill className="object-contain" draggable={false} />
                </div>
              </div>
            </div>
        )}
      </>
  )
}

// ─── BookCard (unchanged) ─────────────────────────────────────────────────────

function BookCard({
                    book,
                    onBuy,
                    onOpenDetail,
                    eagerImage = false,
                    isOwner = false,
                  }: {
  book: Book
  onBuy: (book: Book) => void
  onOpenDetail: (asset: string) => void
  eagerImage?: boolean
  isOwner?: boolean
}) {
  const [favorited, setFavorited] = useState(false)

  return (
      <div
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail(book.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpenDetail(book.id)
            }
          }}
          className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group flex flex-col text-left cursor-pointer"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-secondary">
          <Image
              src={book.cover}
              alt={book.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              loading={eagerImage ? 'eager' : 'lazy'}
          />
          {/* 收藏按钮 */}
          <button
              onClick={(e) => {
                e.stopPropagation()
                setFavorited((v) => !v)
              }}
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
          {isOwner && (
            <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground backdrop-blur">
              我的书
            </span>
          )}
        </div>

        <div className="p-3 flex flex-col flex-1 gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {book.title}
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="font-normal text-muted-foreground">{book.author}</span>
            </p>
          </div>
          <div className="flex items-center justify-between mt-auto pt-1 gap-2">
            <div className="leading-tight">
              {typeof book.priceCny === 'number' && book.priceCny > 0 ? (
                <>
                  <p className="text-primary font-mono font-bold text-base">
                    ¥{book.priceCny.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">{book.price} SOL</p>
                </>
              ) : (
                <p className="text-primary font-mono font-bold text-base">{book.price} SOL</p>
              )}
            </div>
            {isOwner ? (
              <span className="text-[11px] text-muted-foreground">你发布的书籍</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  size="sm"
                  className="h-7 px-3 text-xs rounded-lg bg-yellow-400 text-yellow-950 hover:bg-yellow-300"
                >
                  <Link href={chatWithPeer(book.seller)} onClick={(e) => e.stopPropagation()}>
                    联系卖家
                  </Link>
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onBuy(book)
                  }}
                  className="h-7 px-3 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                >
                  购买
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}

// ─── MarketPage ───────────────────────────────────────────────────────────────

export function MarketPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { publicKey } = useWallet()
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
  const [categoryKey, setCategoryKey] = useState<string | null>(null)
  const [conditionDb, setConditionDb] = useState<string | null>(null)
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('newest')
  const [marketRefreshKey, setMarketRefreshKey] = useState(0)
  const [buyingBook, setBuyingBook] = useState<Book | null>(null)
  const [detailAsset, setDetailAsset] = useState<string | null>(null)
  const sellerFilter = searchParams.get('seller')?.trim() ?? ''

  function clearSellerFilter() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('seller')
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname)
  }

  const { books: filtered, loading } = useMarketBooks({
    keyword: search,
    categoryKey,
    conditionDb,
    sortBy: sort,
    refreshKey: marketRefreshKey,
  })
  const displayedBooks = useMemo(
    () => (sellerFilter ? filtered.filter((b) => b.seller === sellerFilter) : filtered),
    [filtered, sellerFilter],
  )

  return (
      <div className="pb-24 md:pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          {/* 页面标题 */}
          <div className="mb-5">
            <h1 className="text-xl font-bold text-foreground">书籍市场</h1>
            <p className="text-sm text-muted-foreground mt-0.5">共 {displayedBooks.length} 本书籍在售</p>
          </div>
          {sellerFilter ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              <span>
                正在查看卖家 {sellerFilter.slice(0, 4)}...{sellerFilter.slice(-4)} 的在售书籍
              </span>
              <button
                type="button"
                onClick={clearSellerFilter}
                className="shrink-0 rounded p-0.5 text-primary/80 transition-colors hover:bg-primary/15 hover:text-primary"
                aria-label="清除卖家筛选"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

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

          {/* 分类筛选 */}
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

          {/* 品相 + 排序 */}
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
                      <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
            </select>
            <select
                value={sort}
                onChange={(e) => setSort(e.target.value as (typeof SORT_OPTIONS)[number]['value'])}
                className="h-8 px-2 rounded-lg bg-input border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            >
              {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 书籍网格 */}
          {loading ? (
              <div className="text-center py-20 text-muted-foreground text-sm">加载中…</div>
          ) : displayedBooks.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-sm">未找到相关书籍</div>
          ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {displayedBooks.map((book, index) => (
                    <BookCard
                        key={book.id}
                        book={book}
                        onBuy={setBuyingBook}
                        onOpenDetail={setDetailAsset}
                        eagerImage={index < 4}
                isOwner={publicKey?.toBase58() === book.seller}
                    />
                ))}
              </div>
          )}
        </div>

        {/* 购买弹窗 */}
        {buyingBook && (
            <BuyModal
              book={buyingBook}
              onClose={() => setBuyingBook(null)}
              onPurchased={() => setMarketRefreshKey((v) => v + 1)}
            />
        )}

        {/* 详情面板：点击卡片触发 */}
        {detailAsset && (
            <BookDetailPanel
                asset={detailAsset}
                onClose={() => setDetailAsset(null)}
                onBuy={(book) => {
                  setDetailAsset(null)
                  setBuyingBook(book)
                }}
            />
        )}
      </div>
  )
}