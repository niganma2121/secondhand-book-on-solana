'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { areaList } from '@vant/area-data'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import type { Book } from '@/lib/types'
import { useBookCategories } from '@/lib/hooks/use-book-categories'
import { useBookConditions } from '@/lib/hooks/use-book-conditions'
import { useMarketBooks } from '@/lib/hooks/use-market-books'
import { consumeMarketListRefreshRequest } from '@/lib/market-refresh'
import { shortenPubkey } from '@/lib/format-seller'
import { Button } from '@/components/ui/button'
import { Loader2, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { bookPublicHistory, chatWithPeer, userPublicProfile } from '@/config/routes'
import { fetchBookDetail, type BookDetailDto, type BookDetailResponse } from '@/lib/api/book-detail'
import { escrowBookSnapshotToDetailResponse, isOrderTerminalForBookSnapshot } from '@/lib/order-book-snapshot'
import { buildCreateEscrow, broadcastCreateEscrowAuto, signEscrowTxWithWallet } from '@/lib/api/escrow'
import { fetchUserEncryptionPublicKey } from '@/lib/api/encryption'
import { useAuth } from '@/components/providers/auth-provider'
import { ensureCommKeyReady } from '@/lib/encryption/comm-key-provision'
import { upsertOrderShippingCipherByAssetWhenEscrowReady } from '@/lib/api/shipping-cipher'
import { LoginRequiredFlash } from '@/components/features/market/login-required-flash'
import { MarketLoginGatedAction } from '@/components/features/market/market-login-gated-action'
import { MarketFavoriteButton } from '@/components/features/market/market-favorite-button'
import { fetchMyFavorites, postToggleFavorite } from '@/lib/api/favorites'
import { env } from '@/lib/env'
import {
  createMyShippingAddress,
  fetchMyShippingAddresses,
  type ShippingAddressPayload,
} from '@/lib/api/shipping-addresses'

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
  onRequireLogin: (message?: string) => void
  isAuthenticated: boolean
  favorited: boolean
  onFavoriteToggle: () => Promise<void>
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
  if (normalized.includes('blockhash not found')) {
    return '购买失败，请重新尝试。'
  }
  if (
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
// ─── Buy Modal (unchanged) ────────────────────────────────────────────────────

function BuyModal({ book, onClose, onPurchased }: BuyModalProps) {
  const { publicKey, signTransaction, signMessage } = useWallet()
  const { isAuthenticated, sessionStatus, login } = useAuth()
  const openWalletConnect = useOpenWalletConnect()
  const [step, setStep] = useState<'confirm' | 'address' | 'signing' | 'done'>('confirm')
  const [signingPhase, setSigningPhase] = useState<'wallet' | 'broadcast'>('wallet')
  const [shippingPlaintext, setShippingPlaintext] = useState('')
  const [dbShippingAddresses, setDbShippingAddresses] = useState<ShippingAddress[]>([])
  const [selectedDbAddressId, setSelectedDbAddressId] = useState<string | null>(null)
  const [addressFormMode, setAddressFormMode] = useState<'hidden' | 'create'>('hidden')
  const [addressSaving, setAddressSaving] = useState(false)
  const [addressLoading, setAddressLoading] = useState(false)
  /** null = 检测中；卖家未上传通讯加密公钥时无法把收货地址加密给卖家 */
  const [sellerEncryptionOk, setSellerEncryptionOk] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cancelHintOpen, setCancelHintOpen] = useState(false)
  const [manualLabel, setManualLabel] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualProvinceCode, setManualProvinceCode] = useState('')
  const [manualCityCode, setManualCityCode] = useState('')
  const [manualDistrictCode, setManualDistrictCode] = useState('')
  const [manualDetail, setManualDetail] = useState('')

  const provinceMap = areaList.province_list as Record<string, string>
  const cityMap = areaList.city_list as Record<string, string>
  const districtMap = areaList.county_list as Record<string, string>

  const provinceOptions = useMemo(
    () => Object.entries(provinceMap).map(([code, name]) => ({ code, name })),
    [provinceMap],
  )
  const cityOptions = useMemo(() => {
    if (!manualProvinceCode) return []
    const prefix = manualProvinceCode.slice(0, 2)
    return Object.entries(cityMap)
      .filter(([code]) => code.startsWith(prefix))
      .map(([code, name]) => ({ code, name }))
  }, [cityMap, manualProvinceCode])
  const districtOptions = useMemo(() => {
    if (!manualCityCode) return []
    const prefix = manualCityCode.slice(0, 4)
    return Object.entries(districtMap)
      .filter(([code]) => code.startsWith(prefix))
      .map(([code, name]) => ({ code, name }))
  }, [districtMap, manualCityCode])

  useEffect(() => {
    if (!cancelHintOpen) return
    const timer = window.setTimeout(() => setCancelHintOpen(false), 2000)
    return () => window.clearTimeout(timer)
  }, [cancelHintOpen])

  async function ensureAuthenticatedForPurchase() {
    if (!publicKey) {
      openWalletConnect()
      onClose()
      return false
    }
    if (sessionStatus === 'loading') {
      setErrorMsg('正在校验登录态，请稍后重试。')
      return false
    }
    if (isAuthenticated) return true
    if (!signMessage) {
      setErrorMsg('会话已失效，请先在个人中心完成登录验证后再购买。')
      return false
    }
    try {
      await login({ publicKey, signMessage })
      return true
    } catch {
      setErrorMsg('登录验证失败，请先完成登录验证后再购买。')
      return false
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

  function buildManualAddress(): ShippingAddress {
    const region = [
      provinceMap[manualProvinceCode],
      cityMap[manualCityCode],
      districtMap[manualDistrictCode],
    ]
      .filter(Boolean)
      .join(' ')
    return {
      id: `manual-${Date.now()}`,
      label: manualLabel.trim() || '新地址',
      name: manualName.trim(),
      phone: manualPhone.trim(),
      region,
      provinceCode: manualProvinceCode,
      cityCode: manualCityCode,
      districtCode: manualDistrictCode,
      detail: manualDetail.trim(),
    }
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

  async function encryptShippingForSelf(selfEncPubB64: string, plain: string) {
    const selfPub = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(selfEncPubB64),
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
      { name: 'X25519', public: selfPub } as EcdhKeyDeriveParams,
      eph.privateKey,
      256,
    ))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const keySeed = new Uint8Array(shared.length + iv.length)
    keySeed.set(shared, 0)
    keySeed.set(iv, shared.length)
    const aesRaw = await sha256(keySeed)
    const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['encrypt'])
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plain)),
    )
    const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
    return {
      buyer_ciphertext: JSON.stringify({ epk: bytesToBase64(ephPub), ct: bytesToBase64(ct) }),
      buyer_nonce: bytesToBase64(iv),
      buyer_alg: 'x25519_aesgcm_v1',
      encryption_key_version: 'v1',
    }
  }

  async function handleBuy(options?: { afterEscrowCreated?: () => Promise<void> }) {
    const authed = await ensureAuthenticatedForPurchase()
    if (!authed || !publicKey) return
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

      setSigningPhase('wallet')
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
      setSigningPhase('broadcast')
      await broadcastCreateEscrowAuto({
        signed_tx: signedTx,
        asset: book.id,
        seller: book.seller,
        buyer: publicKey.toBase58(),
        price: Math.round(book.price * 1_000_000_000),
      })

      if (options?.afterEscrowCreated) {
        await options.afterEscrowCreated()
      }
      onPurchased?.()
      setStep('done')
      return true
    } catch (e) {
      console.error('[market-buy] purchase failed', e)
      setStep('address')
      setErrorMsg(formatBuyErrorMessage(e))
      return false
    }
  }

  async function handleSubmitAddressAndBuy() {
    const authed = await ensureAuthenticatedForPurchase()
    if (!authed || !publicKey) return
    if (!shippingPlaintext.trim()) {
      setErrorMsg('请选择一个收货地址')
      return
    }
    setAddressSaving(true)
    setErrorMsg(null)
    try {
      const plainForOrder = shippingPlaintext.trim()
      const sellerPub = await fetchUserEncryptionPublicKey(book.seller)
      if (!sellerPub.encryption_public_key?.trim()) {
        throw new Error(
          `卖家（${shortenPubkey(book.seller)}）尚未在个人中心完成通讯密钥初始化，无法加密上传收货地址，请联系卖家开通后再试。`,
        )
      }
      const encrypted = await encryptShippingForSeller(
        sellerPub.encryption_public_key,
        plainForOrder,
      )
      await handleBuy({
        afterEscrowCreated: async () => {
          await upsertOrderShippingCipherByAssetWhenEscrowReady(book.id, {
            ...encrypted,
            encryption_key_version: 'v1',
          })
        },
      })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '收货地址提交失败')
    } finally {
      setAddressSaving(false)
    }
  }

  useEffect(() => {
    if (step !== 'address' || !book.seller) return
    let cancelled = false
    setSellerEncryptionOk(null)
    ;(async () => {
      try {
        const res = await fetchUserEncryptionPublicKey(book.seller)
        if (cancelled) return
        setSellerEncryptionOk(Boolean(res.encryption_public_key?.trim()))
      } catch {
        if (!cancelled) setSellerEncryptionOk(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, book.seller])

  useEffect(() => {
    if (step !== 'address') return
    if (!publicKey || sessionStatus === 'loading') return
    if (!isAuthenticated) {
      setDbShippingAddresses([])
      setSelectedDbAddressId(null)
      setShippingPlaintext('')
      setAddressLoading(false)
      setErrorMsg('登录态已过期，请先完成登录验证后再购买。')
      return
    }
    let cancelled = false
    ;(async () => {
      if (!cancelled) setAddressLoading(true)
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
          setShippingPlaintext(plain)
          setAddressLoading(false)
          return
        }
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : '收货地址加载失败，请先完成登录验证后重试。')
        }
      }
      if (cancelled) return
      setDbShippingAddresses([])
      setSelectedDbAddressId(null)
      setShippingPlaintext('')
      setAddressLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [step, publicKey, isAuthenticated, sessionStatus])

  async function handleCreateAddressInBuyModal() {
    const authed = await ensureAuthenticatedForPurchase()
    if (!authed || !publicKey) return
    if (!manualName.trim()) {
      setErrorMsg('请填写收件人姓名')
      return
    }
    if (!/^\d{11}$/.test(manualPhone.trim())) {
      setErrorMsg('手机号必须为11位数字')
      return
    }
    if (!manualProvinceCode || !manualCityCode || !manualDistrictCode || !manualDetail.trim()) {
      setErrorMsg('请完整填写省市区和详细地址')
      return
    }
    setAddressSaving(true)
    setErrorMsg(null)
    try {
      const manualAddress = buildManualAddress()
      const plainObj = {
        label: manualAddress.label,
        name: manualAddress.name,
        phone: manualAddress.phone,
        region: manualAddress.region,
        provinceCode: manualAddress.provinceCode,
        cityCode: manualAddress.cityCode,
        districtCode: manualAddress.districtCode,
        detail: manualAddress.detail,
      }
      let selfPub = await fetchUserEncryptionPublicKey(publicKey.toBase58())
      if (!selfPub.encryption_public_key?.trim()) {
        if (!signMessage) throw new Error('当前钱包不支持消息签名，无法加密保存收货地址')
        await ensureCommKeyReady({ walletAddress: publicKey.toBase58(), signMessage })
        selfPub = await fetchUserEncryptionPublicKey(publicKey.toBase58())
      }
      const encPub = selfPub.encryption_public_key
      if (!encPub?.trim()) throw new Error('通讯加密公钥未就绪，请稍后重试')
      const encryptedForSelf = await encryptShippingForSelf(encPub, JSON.stringify(plainObj))
      const shouldSetDefault = dbShippingAddresses.length === 0
      const created = await createMyShippingAddress({
        ...encryptedForSelf,
        is_default: shouldSetDefault,
      })
      const latest = await fetchMyShippingAddresses()
      const decrypted = await Promise.all(
        latest.addresses.map((row) => decryptShippingForMe(row, publicKey.toBase58())),
      )
      const createdId = String(created.address.id)
      const current =
        decrypted.find((x) => x.id === createdId) ??
        decrypted[0]
      const plain = current ? formatAddressPlaintext(current) : ''
      setDbShippingAddresses(decrypted)
      setSelectedDbAddressId(current?.id ?? null)
      setShippingPlaintext(plain)
      setAddressFormMode('hidden')
      setManualLabel('')
      setManualName('')
      setManualPhone('')
      setManualProvinceCode('')
      setManualCityCode('')
      setManualDistrictCode('')
      setManualDetail('')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '新增地址失败')
    } finally {
      setAddressSaving(false)
    }
  }

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
                {sellerEncryptionOk === false ? (
                  <div className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-50">
                    <p className="font-semibold text-amber-50">当前卖家未开通收货地址加密</p>
                    <p className="mt-1.5 text-amber-100/95">
                      你的地址会使用卖家的通讯公钥加密后再传给后端；卖家需先在「个人中心」完成通讯密钥 / 加密备份初始化并上传公钥后，你才能下单提交地址。请先联系卖家（卖家钱包{' '}
                      <span className="font-mono">{shortenPubkey(book.seller)}</span>
                      ），或稍后再试。
                    </p>
                  </div>
                ) : sellerEncryptionOk === null ? (
                  <p className="mb-3 text-xs text-muted-foreground">正在检测卖家加密配置...</p>
                ) : null}
                {addressLoading ? (
                  <p className="mb-2 text-xs text-muted-foreground">正在加载你的收货地址...</p>
                ) : null}
                {dbShippingAddresses.length > 0 ? (
                  <div className="mb-3 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                    <p className="mb-2 text-xs font-medium text-foreground">我的收货地址</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {dbShippingAddresses.map((item) => {
                        const plain = formatAddressPlaintext(item)
                        const active = selectedDbAddressId === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedDbAddressId(item.id)
                              setShippingPlaintext(plain)
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
                ) : (
                  !addressLoading ? <p className="mb-2 text-xs text-muted-foreground">暂无地址，请新增地址。</p> : null
                )}
                <div className="mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddressFormMode((v) => (v === 'create' ? 'hidden' : 'create'))}
                    disabled={addressSaving}
                  >
                    {addressFormMode === 'create' ? '收起新增地址' : '新增地址'}
                  </Button>
                </div>
                {addressFormMode === 'create' ? (
                  <div className="space-y-2">
                    <input
                      value={manualLabel}
                      onChange={(e) => setManualLabel(e.target.value)}
                      placeholder="地址标签（如：家 / 公司）"
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="收件人姓名"
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    <input
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="手机号（11位）"
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={manualProvinceCode}
                        onChange={(e) => {
                          setManualProvinceCode(e.target.value)
                          setManualCityCode('')
                          setManualDistrictCode('')
                        }}
                        className="h-10 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                      >
                        <option value="">省</option>
                        {provinceOptions.map((p) => (
                          <option key={p.code} value={p.code}>{p.name}</option>
                        ))}
                      </select>
                      <select
                        value={manualCityCode}
                        onChange={(e) => {
                          setManualCityCode(e.target.value)
                          setManualDistrictCode('')
                        }}
                        disabled={!manualProvinceCode}
                        className="h-10 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="">市</option>
                        {cityOptions.map((c) => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        value={manualDistrictCode}
                        onChange={(e) => setManualDistrictCode(e.target.value)}
                        disabled={!manualCityCode}
                        className="h-10 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="">区/县</option>
                        {districtOptions.map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={manualDetail}
                      onChange={(e) => setManualDetail(e.target.value)}
                      placeholder="详细地址（街道、门牌、楼栋、房号）"
                      className="w-full min-h-28 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    <Button
                      onClick={handleCreateAddressInBuyModal}
                      size="sm"
                      disabled={
                        addressSaving ||
                        !manualName.trim() ||
                        !/^\d{11}$/.test(manualPhone.trim()) ||
                        !manualProvinceCode ||
                        !manualCityCode ||
                        !manualDistrictCode ||
                        !manualDetail.trim()
                      }
                    >
                      {addressSaving ? '保存中...' : '保存新地址'}
                    </Button>
                  </div>
                ) : null}
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
                    disabled={
                      addressSaving ||
                      !shippingPlaintext.trim() ||
                      sellerEncryptionOk === false ||
                      sellerEncryptionOk === null
                    }
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
                <p className="text-lg font-semibold text-foreground">
                  {signingPhase === 'wallet' ? '等待钱包签名...' : '购买广播中...'}
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  {signingPhase === 'wallet'
                    ? '收货地址已加密确认，接下来请在钱包中确认购买签名。'
                    : '签名已完成，正在提交到链上并同步订单，请稍候。'}
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
                      onClick={async () => {
                        setErrorMsg(null)
                        const authed = await ensureAuthenticatedForPurchase()
                        if (!authed) return
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
          <div className="fixed left-1/2 top-1/2 z-[90] w-[min(92vw,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-center text-sm md:text-base text-destructive shadow-md">
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

/** 详情页价格：移动端与 PC 同一结构——人民币在上（大号绿色）、SOL 在下（黄色） */
function DetailBookPriceBlock({ book }: { book: BookDetailDto }) {
  const sol = book.price / 1_000_000_000
  const showCny = typeof book.price_cny === 'number' && book.price_cny > 0

  return (
    <div className="space-y-1.5">
      {showCny ? (
        <>
          <p className="text-3xl lg:text-4xl font-bold text-primary tabular-nums tracking-tight">
            ¥{book.price_cny!.toFixed(2)}
          </p>
          <p className="text-lg lg:text-xl font-mono font-semibold text-yellow-500 dark:text-yellow-400 tabular-nums">
            {sol.toFixed(3)} SOL
          </p>
          {typeof book.fx_cny_per_sol === 'number' && book.fx_cny_per_sol > 0 && (
            <p className="text-xs lg:text-sm text-muted-foreground pt-0.5">
              上架汇率 1 SOL≈¥{book.fx_cny_per_sol.toFixed(2)}
            </p>
          )}
        </>
      ) : (
        <p className="text-3xl lg:text-4xl font-mono font-bold text-yellow-500 dark:text-yellow-400 tabular-nums">
          {sol.toFixed(3)}
          <span className="text-xl lg:text-2xl font-semibold ml-1.5">SOL</span>
        </p>
      )}
    </div>
  )
}

function BookDetailPanel({
  asset,
  onClose,
  onBuy,
  onRequireLogin,
  isAuthenticated,
  favorited,
  onFavoriteToggle,
}: DetailPanelProps) {
  const searchParams = useSearchParams()
  const orderEscrow = searchParams.get('orderEscrow')?.trim() ?? ''
  const orderState = searchParams.get('orderState')?.trim() ?? ''
  const fromOrder = searchParams.get('fromOrder') === '1' || Boolean(orderEscrow)
  const orderTerminalSnapshot = fromOrder && isOrderTerminalForBookSnapshot(orderState)

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
  /** 双指捏合缩放：记录手势起点距离与当时 scale */
  const pinchRef = useRef<{ d0: number; s0: number } | null>(null)

  // 构造画廊列表：封面排第一
  const galleryImages = useMemo(() => {
    if (!detail) return []
    return [
      ...(detail.book.cover_url ? [{ id: -1, url: detail.book.cover_url, kind: 'cover' as const }] : []),
      ...detail.images.map((img) => ({ id: img.id, url: img.url, kind: 'detail' as const })),
    ]
  }, [detail])

  const activeImage = galleryImages[activeIndex] ?? null

  const bookForBuy = useMemo((): Book | null => {
    if (!detail) return null
    return {
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
    } as unknown as Book
  }, [detail])

  const handleDetailBuy = useCallback(() => {
    if (!onBuy || !bookForBuy) return
    onBuy(bookForBuy)
  }, [onBuy, bookForBuy])

  // 加载详情：订单上下文下，已结束订单优先用 sessionStorage 中的下单快照；进行中则拉当前链上
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setBookDescription('暂无图书简介')
      try {
        if (orderTerminalSnapshot && orderEscrow && typeof window !== 'undefined') {
          const raw = sessionStorage.getItem(`bookchain:order-book-snapshot:${orderEscrow}`)
          if (raw) {
            let snap: unknown
            try {
              snap = JSON.parse(raw) as unknown
            } catch {
              snap = null
            }
            const synthetic = escrowBookSnapshotToDetailResponse(snap)
            if (synthetic && !cancelled) {
              setDetail(synthetic)
              setActiveIndex(0)
              if (synthetic.book.metadata_url) {
                try {
                  const mdRes = await fetch(synthetic.book.metadata_url)
                  if (mdRes.ok) {
                    const md = (await mdRes.json()) as { description?: string }
                    const desc = md.description?.trim()
                    if (!cancelled && desc) setBookDescription(desc)
                  }
                } catch { /* ignore */ }
              }
              setLoading(false)
              return
            }
          }
        }

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
  }, [asset, orderEscrow, orderTerminalSnapshot])

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
      pinchRef.current = null
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
            className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
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
              'fixed z-[60] bg-card border border-border shadow-2xl',
              'flex flex-col',
              // 移动端：底部全屏；使用 dvh 减少地址栏伸缩裁切
              'inset-x-0 bottom-0 rounded-t-2xl max-h-[96dvh]',
              // 桌面端：居中
              'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
              'sm:rounded-2xl sm:w-[min(92vw,1200px)] sm:h-[min(90vh,900px)] sm:max-h-[96vh]',
              'animate-in slide-in-from-bottom sm:slide-in-from-bottom-4 duration-300',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
        >
          {/* ── 顶部栏：返回 + 标题 + 收藏 ── */}
          <div className="flex items-center gap-2 px-3 sm:px-5 py-3.5 border-b border-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1"
              aria-label="返回"
            >
              <ChevronLeft size={20} className="shrink-0" />
              <span className="text-xs sm:text-sm">返回</span>
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate text-center sm:text-left">
              {loading ? '加载中…' : (detail?.book.name ?? '书籍详情')}
            </p>
            {fromOrder ? (
              <div className="w-9 shrink-0" aria-hidden />
            ) : (
              <MarketFavoriteButton
                variant="header"
                favorited={favorited}
                isAuthenticated={isAuthenticated}
                onToggle={onFavoriteToggle}
                onRequireLogin={onRequireLogin}
              />
            )}
          </div>

          {/* ── 内容区 ── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {fromOrder && (
              <div className="mx-3 sm:mx-5 mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] sm:text-xs text-amber-950/90 dark:text-amber-100/90 leading-relaxed">
                {orderTerminalSnapshot
                  ? '本订单已结束：以下为下单时冻结的书目快照；若本页未带回快照则与当前链上数据一致。'
                  : '本订单进行中：以下为当前链上书目。'}
              </div>
            )}
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
                                key={`main-${activeIndex}-${activeImage.url}`}
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
                                    key={`thumb-${img.kind}-${idx}-${img.url}`}
                                    onClick={() => setActiveIndex(idx)}
                                    className={[
                                      'relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-all',
                                      activeIndex === idx
                                          ? 'border-primary ring-2 ring-primary/30 scale-105'
                                          : 'border-transparent opacity-60 hover:opacity-90',
                                    ].join(' ')}
                                    aria-label={img.kind === 'cover' ? '封面' : `详情图 ${idx}`}
                                >
                                  <Image src={img.url} alt="" fill className="object-cover" sizes="80px" />
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

                    {/* 书名 & 作者（桌面端字号略放大） */}
                    <div>
                      <h2 className="text-2xl lg:text-3xl font-bold text-foreground leading-snug">
                        {detail.book.name}
                      </h2>
                      <p className="text-sm lg:text-base text-muted-foreground mt-1.5">
                        {detail.book.author || '作者未知'}
                        {detail.book.series ? ` · ${detail.book.series}` : ''}
                      </p>
                    </div>

                    {/* 价格 & 状态：移动端与桌面共用 DetailBookPriceBlock */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs lg:text-sm text-muted-foreground mb-0.5 lg:mb-1">当前价格</p>
                        <DetailBookPriceBlock book={detail.book} />
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs lg:text-sm font-semibold text-primary">
                        {statusLabel}
                      </span>
                    </div>

                    {/* 属性表格（桌面正文字号加大） */}
                    <div className="rounded-xl border border-border/60 overflow-hidden text-sm lg:text-base">
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
                            <span className="shrink-0 w-20 lg:w-24 text-muted-foreground lg:text-[15px]">{label}</span>
                            <span
                                className={[
                                  'flex-1 min-w-0 text-foreground font-medium',
                                  mono ? 'font-mono text-xs lg:text-sm' : 'lg:text-[15px]',
                                  truncate ? 'truncate' : '',
                                ].join(' ')}
                                title={value}
                            >
                        {value}
                      </span>
                          </div>
                      ))}
                    </div>

                    {/* 图书简介（桌面正文字号加大） */}
                    <div className="rounded-xl bg-secondary/30 border border-border/40 p-4 lg:p-5 flex-1 lg:pb-2">
                      <p className="text-xs lg:text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 lg:mb-3">
                        图书简介
                      </p>
                      <p className="text-sm lg:text-[15px] lg:leading-8 text-foreground whitespace-pre-wrap">
                        {bookDescription}
                      </p>
                    </div>

                    {/* 桌面端：按钮仍在信息流底部；移动端改为面板底部固定栏，见下方 footer */}
                    {!fromOrder && (
                    <div className="hidden lg:flex flex-col gap-2.5 pb-2 lg:flex-row lg:flex-wrap lg:items-stretch">
                      {isOwner ? (
                        <span className="min-h-10 w-full rounded-xl border border-border/60 bg-secondary/30 text-sm text-muted-foreground inline-flex items-center justify-center px-3 py-2 text-center">
                          这是你发布的书籍
                        </span>
                      ) : (
                        <>
                          <MarketLoginGatedAction
                              href={chatWithPeer(detail.book.seller)}
                              linkVariant="inline"
                              className="w-full lg:flex-1 min-w-0 inline-flex items-center justify-center min-h-10 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition-colors px-3 py-2 text-center"
                              isAuthenticated={isAuthenticated}
                              onRequireLogin={onRequireLogin}
                          >
                            联系卖家
                          </MarketLoginGatedAction>
                          {onBuy && bookForBuy && (
                              <MarketLoginGatedAction
                                  size="default"
                                  className="w-full lg:flex-1 min-w-0 min-h-10 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 whitespace-normal"
                                  isAuthenticated={isAuthenticated}
                                  onRequireLogin={onRequireLogin}
                                  onAuthedClick={handleDetailBuy}
                              >
                                立即购买
                              </MarketLoginGatedAction>
                          )}
                        </>
                      )}
                      <Link
                        href={userPublicProfile(detail.book.seller)}
                        className="w-full lg:w-auto lg:shrink-0 inline-flex items-center justify-center min-h-10 rounded-xl border border-border/60 bg-card px-4 text-sm text-primary hover:bg-secondary/50 transition-colors"
                      >
                        卖家主页
                      </Link>
                      <Link
                        href={bookPublicHistory(detail.book.asset)}
                        className="w-full lg:w-auto lg:shrink-0 inline-flex items-center justify-center min-h-10 rounded-xl border border-border/60 bg-card px-4 text-sm text-primary hover:bg-secondary/50 transition-colors"
                      >
                        流转记录
                      </Link>
                    </div>
                    )}
                  </div>
                </div>
            )}
          </div>

          {/* 移动端底部固定操作栏（不参与中间滚动，避免被底部导航/安全区遮住） */}
          {detail && !loading && !error && !fromOrder && (
            <div className="lg:hidden shrink-0 border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
              {isOwner ? (
                <span className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5 text-center text-sm text-muted-foreground">
                  这是你发布的书籍
                </span>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <Link
                    href={userPublicProfile(detail.book.seller)}
                    className="text-center text-xs text-primary hover:underline py-0.5"
                  >
                    卖家主页 · 信誉与评价
                  </Link>
                  <MarketLoginGatedAction
                    href={chatWithPeer(detail.book.seller)}
                    linkVariant="inline"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-primary px-3 py-2.5 text-center text-sm font-medium text-primary hover:bg-primary/5"
                    isAuthenticated={isAuthenticated}
                    onRequireLogin={onRequireLogin}
                  >
                    联系卖家
                  </MarketLoginGatedAction>
                  {onBuy && bookForBuy && (
                    <MarketLoginGatedAction
                      size="default"
                      className="min-h-11 w-full bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90"
                      isAuthenticated={isAuthenticated}
                      onRequireLogin={onRequireLogin}
                      onAuthedClick={handleDetailBuy}
                    >
                      立即购买
                    </MarketLoginGatedAction>
                  )}
                </div>
              )}
              <Link
                href={bookPublicHistory(detail.book.asset)}
                className="flex min-h-10 w-full items-center justify-center rounded-xl border border-border/60 bg-card px-3 py-2 text-center text-sm text-primary hover:bg-secondary/40"
              >
                本书流转记录
              </Link>
            </div>
          )}
        </div>

        {/* ── 放大预览 Lightbox ── */}
        {zoomImage && (
            <div
                className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center touch-none"
                onWheel={(e) => {
                  e.stopPropagation()
                  const next = e.deltaY < 0 ? zoomScale + 0.15 : zoomScale - 0.15
                  setZoomScale(Math.max(0.5, Math.min(5, Number(next.toFixed(2)))))
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 2) {
                    const d = Math.hypot(
                      e.touches[0].clientX - e.touches[1].clientX,
                      e.touches[0].clientY - e.touches[1].clientY,
                    )
                    pinchRef.current = { d0: Math.max(d, 1), s0: zoomScale }
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches.length !== 2 || !pinchRef.current) return
                  e.preventDefault()
                  const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                  )
                  const next = pinchRef.current.s0 * (Math.max(d, 1) / pinchRef.current.d0)
                  setZoomScale(Math.max(0.5, Math.min(5, Number(next.toFixed(3)))))
                }}
                onTouchEnd={() => {
                  pinchRef.current = null
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
                    className={`absolute inset-0 ${isDraggingZoom ? 'cursor-grabbing' : 'cursor-grab'}`}
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
  isAuthenticated,
  onRequireLogin,
  favorited,
  onFavoriteToggle,
}: {
  book: Book
  onBuy: (book: Book) => void
  onOpenDetail: (asset: string) => void
  eagerImage?: boolean
  isOwner?: boolean
  isAuthenticated: boolean
  onRequireLogin: (message?: string) => void
  favorited: boolean
  onFavoriteToggle: () => Promise<void>
}) {
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
          className="bg-card border border-border rounded-xl hover:border-primary/30 transition-colors group flex flex-col text-left cursor-pointer min-w-0"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-secondary rounded-t-xl">
          <Image
              src={book.cover}
              alt={book.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              loading={eagerImage ? 'eager' : 'lazy'}
          />
          <MarketFavoriteButton
            variant="card"
            favorited={favorited}
            isAuthenticated={isAuthenticated}
            onToggle={onFavoriteToggle}
            onRequireLogin={onRequireLogin}
          />
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
          <div className="mt-auto pt-1 flex flex-col gap-2 min-w-0">
            <div className="leading-tight shrink-0">
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
              <div className="flex gap-2 w-full min-w-0">
                <MarketLoginGatedAction
                  href={chatWithPeer(book.seller)}
                  linkVariant="shadcn"
                  size="sm"
                  className="h-8 flex-1 min-w-0 px-2 text-xs rounded-lg bg-yellow-400 text-yellow-950 hover:bg-yellow-300"
                  isAuthenticated={isAuthenticated}
                  onRequireLogin={onRequireLogin}
                  stopPropagation
                >
                  联系卖家
                </MarketLoginGatedAction>
                <MarketLoginGatedAction
                  className="h-8 flex-1 min-w-0 px-2 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                  isAuthenticated={isAuthenticated}
                  onRequireLogin={onRequireLogin}
                  onAuthedClick={() => onBuy(book)}
                  stopPropagation
                >
                  购买
                </MarketLoginGatedAction>
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
  const { isAuthenticated } = useAuth()
  const [favoriteAssets, setFavoriteAssets] = useState<string[]>([])

  const refreshFavoriteAssets = useCallback(async () => {
    if (!isAuthenticated || env.useMockData || !env.apiBaseUrl) {
      setFavoriteAssets([])
      return
    }
    try {
      const { books } = await fetchMyFavorites(1, 300)
      setFavoriteAssets(books.map((b) => b.asset.trim()))
    } catch {
      setFavoriteAssets([])
    }
  }, [isAuthenticated])

  useEffect(() => {
    void refreshFavoriteAssets()
  }, [refreshFavoriteAssets])

  const handleFavoriteToggleForAsset = useCallback(async (asset: string) => {
    const a = asset.trim()
    const { favorited } = await postToggleFavorite(a)
    setFavoriteAssets((prev) => {
      const s = new Set(prev.map((x) => x.trim()))
      if (favorited) s.add(a)
      else s.delete(a)
      return Array.from(s)
    })
  }, [])

  const [loginFlash, setLoginFlash] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  })
  const hideLoginFlash = useCallback(() => {
    setLoginFlash((s) => ({ ...s, open: false }))
  }, [])
  const showLoginFlash = useCallback((message = '请先登录') => {
    setLoginFlash({ open: true, message })
  }, [])
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
  const assetFromUrl = searchParams.get('asset')?.trim() ?? ''

  useEffect(() => {
    if (consumeMarketListRefreshRequest()) {
      setMarketRefreshKey((k) => k + 1)
    }
  }, [])

  useEffect(() => {
    if (!assetFromUrl) return
    setDetailAsset(assetFromUrl)
  }, [assetFromUrl])

  function closeBookDetail() {
    if (!searchParams.get('asset')) {
      setDetailAsset(null)
      return
    }

    const rawReturn = searchParams.get('returnTo')
    let returnTo: string | null = null
    if (rawReturn) {
      const t = rawReturn.trim()
      if (t.startsWith('/') && !t.startsWith('//') && !/^[a-zA-Z][a-zA-Z+\-.]*:/.test(t)) {
        returnTo = t
      }
    }

    // 从订单等页点进市场详情：先整页离开，避免先关面板再 replace 导致一帧露出市场列表而闪烁
    if (returnTo) {
      let usedHistoryBack = false
      try {
        if (
          typeof window !== 'undefined' &&
          sessionStorage.getItem('bookchain:market-detail-use-history-back') === '1'
        ) {
          sessionStorage.removeItem('bookchain:market-detail-use-history-back')
          router.back()
          usedHistoryBack = true
        }
      } catch {
        /* ignore */
      }
      if (!usedHistoryBack) {
        router.replace(returnTo, { scroll: false })
      }
      return
    }

    setDetailAsset(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('asset')
    p.delete('fromOrder')
    p.delete('orderEscrow')
    p.delete('orderState')
    p.delete('returnTo')
    const q = p.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

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
        <LoginRequiredFlash
          open={loginFlash.open}
          message={loginFlash.message}
          onClose={hideLoginFlash}
        />
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
                        isAuthenticated={isAuthenticated}
                        onRequireLogin={showLoginFlash}
                        favorited={favoriteAssets.includes(book.id)}
                        onFavoriteToggle={() => handleFavoriteToggleForAsset(book.id)}
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
                onClose={closeBookDetail}
                onBuy={(book) => {
                  closeBookDetail()
                  setBuyingBook(book)
                }}
                isAuthenticated={isAuthenticated}
                onRequireLogin={showLoginFlash}
                favorited={favoriteAssets.includes(detailAsset)}
                onFavoriteToggle={() => handleFavoriteToggleForAsset(detailAsset)}
            />
        )}
      </div>
  )
}