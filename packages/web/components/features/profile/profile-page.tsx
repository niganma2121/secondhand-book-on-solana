'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { areaList } from '@vant/area-data'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { routes } from '@/config/routes'
import { env } from '@/lib/env'
import type { MyBook } from '@/lib/types'
import { useMyBooks } from '@/lib/hooks/use-my-books'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api/client'
import { updateMyProfile } from '@/lib/api/profile'
import {
  fetchEncryptionTemplates,
  fetchMyEncryptionBackup,
  fetchUserEncryptionPublicKey,
  type EncryptionTemplate,
  type MyEncryptionBackup,
} from '@/lib/api/encryption'
import {
  base64ToBytes,
  bytesToBase64,
  commKeyLocalStorageKey,
  ensureCommKeyReady,
} from '@/lib/encryption/comm-key-provision'
import {
  createMyShippingAddress,
  deleteMyShippingAddress,
  fetchMyShippingAddresses,
  setDefaultMyShippingAddress,
  updateMyShippingAddress,
  type ShippingAddressPayload,
} from '@/lib/api/shipping-addresses'

type ProfileTab = 'shelf' | 'sold'
type ShippingAddress = {
  id: string
  label: string
  name: string
  phone: string
  region: string
  provinceCode: string
  cityCode: string
  districtCode: string
  detail: string
}
type ShippingProfileStore = {
  addresses: ShippingAddress[]
  defaultId: string | null
}

function dedupeShippingAddressesById(addresses: ShippingAddress[]) {
  const seen = new Set<string>()
  const result: ShippingAddress[] = []
  for (const item of addresses) {
    const id = item.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ ...item, id })
  }
  return result
}

function createLocalAddressId(existingIds: Set<string>) {
  let next =
    globalThis.crypto?.randomUUID?.() ??
    `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  while (existingIds.has(next)) {
    next =
      globalThis.crypto?.randomUUID?.() ??
      `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  return next
}

const STATUS_LABEL: Record<MyBook['status'], { text: string; cls: string }> = {
  listed: { text: '在售', cls: 'text-primary bg-primary/10' },
  sold:   { text: '已售', cls: 'text-muted-foreground bg-secondary' },
  owned:  { text: '已购', cls: 'text-blue-400 bg-blue-400/10' },
}

function MiniBookCard({ book }: { book: MyBook }) {
  const s = STATUS_LABEL[book.status]
  return (
    <div className="flex gap-3 p-3 rounded-2xl bg-secondary/40 border border-border/50 items-center">
      <div className="relative w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-card">
        <Image src={book.cover} alt={book.title} fill className="object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{book.title}</p>
        <p className="text-xs text-muted-foreground">{book.author}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-xs text-primary font-bold">{book.price} SOL</span>
          <span className={['text-[10px] px-1.5 py-0.5 rounded font-medium', s.cls].join(' ')}>{s.text}</span>
        </div>
      </div>
      {book.status === 'listed' && (
        <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 rounded-xl" asChild>
          <Link href={routes.shelf}>管理</Link>
        </Button>
      )}
    </div>
  )
}

function ProfileAccessState({
  title,
  description,
  actionLabel,
  onAction,
  loading = false,
  errorText = null,
  actionVariant = 'primary',
}: {
  title: string
  /** 省略则不展示副文案 */
  description?: string
  actionLabel: string
  onAction: () => void
  loading?: boolean
  errorText?: string | null
  actionVariant?: 'primary' | 'verify'
}) {
  const actionClassName =
    actionVariant === 'verify'
      ? 'bg-amber-500 text-amber-950 hover:bg-amber-400 animate-wallet-verify-breathe'
      : 'bg-primary text-primary-foreground'
  return (
    <div className="pb-24 md:pb-10 min-h-[60vh] flex flex-col items-center justify-center px-6 gap-6">
      <div className="w-20 h-20 rounded-3xl bg-card border border-border/60 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="text-muted-foreground">
          <circle cx="18" cy="13" r="6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 32c0-7.18 5.82-13 13-13s13 5.82 13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center">
        <p className="font-bold text-lg text-foreground">{title}</p>
        {description?.trim() ? (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">{description}</p>
        ) : null}
      </div>
      {errorText ? <p className="text-xs text-destructive text-center max-w-[300px]">{errorText}</p> : null}
      <Button
        onClick={onAction}
        className={`${actionClassName} h-11 px-8 rounded-xl font-semibold`}
        disabled={loading}
      >
        {loading ? '处理中...' : actionLabel}
      </Button>
    </div>
  )
}

export function ProfilePage() {
  const { publicKey, disconnect, signMessage } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [profileTab, setProfileTab] = useState<ProfileTab>('shelf')
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false)
  const [templates, setTemplates] = useState<EncryptionTemplate[]>([])
  const [backupPayload, setBackupPayload] = useState<MyEncryptionBackup | null>(null)
  const [backupVersion, setBackupVersion] = useState<string | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressActionLoading, setAddressActionLoading] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressHint, setAddressHint] = useState<string | null>(null)
  const [pendingDeleteShippingId, setPendingDeleteShippingId] = useState<string | null>(null)
  const [shippingName, setShippingName] = useState('')
  const [shippingPhone, setShippingPhone] = useState('')
  const [shippingLabel, setShippingLabel] = useState('')
  const [shippingProvinceCode, setShippingProvinceCode] = useState('')
  const [shippingCityCode, setShippingCityCode] = useState('')
  const [shippingDistrictCode, setShippingDistrictCode] = useState('')
  const [shippingDetail, setShippingDetail] = useState('')
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([])
  const [selectedShippingId, setSelectedShippingId] = useState<string | null>(null)
  const [defaultShippingId, setDefaultShippingId] = useState<string | null>(null)
  const [addressFormMode, setAddressFormMode] = useState<'hidden' | 'create' | 'edit'>('hidden')
  const [profileNameDraft, setProfileNameDraft] = useState('')
  const [profileAvatarPreview, setProfileAvatarPreview] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [securityAutoLock, setSecurityAutoLock] = useState(true)
  const [securityHideAddress, setSecurityHideAddress] = useState(true)
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const {
    user,
    isAuthenticated,
    sessionStatus,
    login,
    authLoading,
    authError,
    refreshSession,
  } = useAuth()

  const addr = publicKey ? publicKey.toBase58() : ''
  const short = addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : ''

  const { books: myBooks } = useMyBooks()

  const shelfBooks = myBooks.filter((b) => b.status === 'listed' || b.status === 'sold')
  const boughtBooks = myBooks.filter((b) => b.status === 'owned')

  const displayName =
    isAuthenticated && user?.username ? user.username : '匿名用户'
  const avatarUrl = profileAvatarPreview ?? user?.avatar ?? null

  const stats: { label: string; value: number | string }[] = [
    { label: '上架书籍', value: shelfBooks.filter((b) => b.status === 'listed').length },
    {
      label: '历史交易',
      value: isAuthenticated && user ? user.trade_count : '—',
    },
    { label: '已购书籍', value: boughtBooks.length },
    { label: '累计收益', value: '—' },
  ]

  const apiConfigured = !env.useMockData && Boolean(env.apiBaseUrl)
  const localCommKeyStorageKey = addr ? commKeyLocalStorageKey(addr) : ''
  const profileShippingStorageKey = addr ? `bookchain:shipping-profile:${addr}` : ''
  const provinceMap = areaList.province_list as Record<string, string>
  const cityMap = areaList.city_list as Record<string, string>
  const districtMap = areaList.county_list as Record<string, string>

  const provinceOptions = useMemo(
    () => Object.entries(provinceMap).map(([code, name]) => ({ code, name })),
    [provinceMap],
  )
  const cityOptions = useMemo(() => {
    if (!shippingProvinceCode) return []
    const prefix = shippingProvinceCode.slice(0, 2)
    return Object.entries(cityMap)
      .filter(([code]) => code.startsWith(prefix))
      .map(([code, name]) => ({ code, name }))
  }, [cityMap, shippingProvinceCode])
  const districtOptions = useMemo(() => {
    if (!shippingCityCode) return []
    const prefix = shippingCityCode.slice(0, 4)
    return Object.entries(districtMap)
      .filter(([code]) => code.startsWith(prefix))
      .map(([code, name]) => ({ code, name }))
  }, [districtMap, shippingCityCode])

  const shippingRegionText = [
    provinceMap[shippingProvinceCode],
    cityMap[shippingCityCode],
    districtMap[shippingDistrictCode],
  ]
    .filter(Boolean)
    .join(' ')

  function resetShippingForm() {
    setShippingLabel('')
    setShippingName('')
    setShippingPhone('')
    setShippingProvinceCode('')
    setShippingCityCode('')
    setShippingDistrictCode('')
    setShippingDetail('')
  }

  function fillShippingForm(address: ShippingAddress) {
    setShippingLabel(address.label)
    setShippingName(address.name)
    setShippingPhone(address.phone)
    setShippingProvinceCode(address.provinceCode)
    setShippingCityCode(address.cityCode)
    setShippingDistrictCode(address.districtCode)
    setShippingDetail(address.detail)
  }

  function toLocalStorageProfile(addresses: ShippingAddress[], defaultId: string | null) {
    if (!profileShippingStorageKey) return
    localStorage.setItem(
      profileShippingStorageKey,
      JSON.stringify({
        addresses,
        defaultId,
      } satisfies ShippingProfileStore),
    )
  }

  function toBackendAddressId(id: string | null): number | null {
    if (!id) return null
    const n = Number(id)
    if (!Number.isInteger(n) || n <= 0) return null
    return n
  }

  function normalizeShippingProfile(raw: string): ShippingProfileStore {
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
    if (Array.isArray(parsed.addresses)) {
      const addresses = dedupeShippingAddressesById(parsed.addresses
        .filter((item) =>
          Boolean(item?.id && item?.name && item?.provinceCode && item?.cityCode && item?.districtCode && item?.detail),
        )
        .map((item) => ({
          ...item,
          phone: item.phone ?? '',
        })))
      const defaultId = addresses.some((x) => x.id === parsed.defaultId) ? (parsed.defaultId ?? null) : (addresses[0]?.id ?? null)
      return { addresses, defaultId }
    }
    if (parsed.name && parsed.provinceCode && parsed.cityCode && parsed.districtCode && parsed.detail) {
      const legacy: ShippingAddress = {
        id: `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  }

  async function refreshShippingAddressesFromSource() {
    if (!isAuthenticated) return
    if (apiConfigured) {
      const addressRes = await fetchMyShippingAddresses().catch(() => ({ addresses: [] as ShippingAddressPayload[] }))
      if (addressRes.addresses.length > 0) {
        const mapped = dedupeShippingAddressesById(await Promise.all(
          addressRes.addresses.map(async (row) => {
            const plain = await decryptShippingForMe(row, addr)
            return { id: String(row.id), ...plain }
          }),
        ))
        const defaultId = String(addressRes.addresses.find((x) => x.is_default)?.id ?? mapped[0]?.id ?? '')
        const resolvedDefault = mapped.find((x) => x.id === defaultId)?.id ?? mapped[0]?.id ?? null
        setShippingAddresses(mapped)
        setSelectedShippingId(resolvedDefault)
        setDefaultShippingId(resolvedDefault)
        const current = mapped.find((x) => x.id === resolvedDefault) ?? mapped[0]
        if (current) fillShippingForm(current)
        else resetShippingForm()
        toLocalStorageProfile(mapped, resolvedDefault)
      } else {
        setShippingAddresses([])
        setSelectedShippingId(null)
        setDefaultShippingId(null)
        resetShippingForm()
        toLocalStorageProfile([], null)
      }
      return
    }
    if (profileShippingStorageKey) {
      const raw = localStorage.getItem(profileShippingStorageKey)
      const normalized = raw ? normalizeShippingProfile(raw) : { addresses: [], defaultId: null }
      setShippingAddresses(normalized.addresses)
      setSelectedShippingId(normalized.defaultId)
      setDefaultShippingId(normalized.defaultId)
      const current = normalized.addresses.find((x) => x.id === normalized.defaultId) ?? normalized.addresses[0]
      if (current) fillShippingForm(current)
      else resetShippingForm()
    }
  }

  useEffect(() => {
    setProfileNameDraft(user?.username ?? '')
  }, [user?.username])

  useEffect(() => {
    if (!addressHint) return
    const timer = window.setTimeout(() => setAddressHint(null), 2000)
    return () => window.clearTimeout(timer)
  }, [addressHint])

  async function sha256(data: Uint8Array) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  }

  async function loadLocalCommPrivateKey(pubkey: string) {
    const key = localStorage.getItem(commKeyLocalStorageKey(pubkey))
    if (!key) return null
    return crypto.subtle.importKey('pkcs8', base64ToBytes(key), { name: 'X25519' } as EcKeyImportParams, false, ['deriveBits'])
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

  async function decryptShippingForMe(payload: ShippingAddressPayload, pubkey: string) {
    const key = await loadLocalCommPrivateKey(pubkey)
    if (!key) throw new Error('本地通讯私钥不存在，请先完成自动恢复')
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
    const decoded = JSON.parse(new TextDecoder().decode(plain)) as Partial<ShippingAddress>
    // 后端记录必须以数据库 id 为准，避免历史本地 id 覆盖导致删除无法命中后端接口。
    return {
      label: decoded.label ?? '默认地址',
      name: decoded.name ?? '',
      phone: decoded.phone ?? '',
      region: decoded.region ?? '',
      provinceCode: decoded.provinceCode ?? '',
      cityCode: decoded.cityCode ?? '',
      districtCode: decoded.districtCode ?? '',
      detail: decoded.detail ?? '',
    } satisfies Omit<ShippingAddress, 'id'>
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setBackupVersion(null)
      setAddressError(null)
      return
    }
    let cancelled = false
    async function loadAddressMeta() {
      setAddressLoading(true)
      setAddressError(null)
      try {
        const [tplRes, backupRes, addressRes] = await Promise.all([
          fetchEncryptionTemplates(),
          fetchMyEncryptionBackup().catch((err) => {
            if (err instanceof ApiError && err.status === 404) return null
            throw err
          }),
          isAuthenticated && apiConfigured
            ? fetchMyShippingAddresses().catch(() => ({ addresses: [] as ShippingAddressPayload[] }))
            : Promise.resolve({ addresses: [] as ShippingAddressPayload[] }),
        ])
        if (cancelled) return
        setTemplates(tplRes.templates)
        if (backupRes) {
          setBackupPayload(backupRes)
          setBackupVersion(backupRes.backup_version)
        } else {
          setBackupPayload(null)
          setBackupVersion(null)
        }
        await refreshShippingAddressesFromSource()
      } catch (err) {
        if (cancelled) return
        setAddressError(err instanceof Error ? err.message : '地址配置加载失败')
      } finally {
        if (!cancelled) setAddressLoading(false)
      }
    }
    void loadAddressMeta()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  async function handleSaveShippingProfile() {
    if (!profileShippingStorageKey) return
    const phone = shippingPhone.trim()
    if (!/^\d{11}$/.test(phone)) {
      setAddressError('手机号必须为11位数字')
      return
    }
    const existingIds = new Set(shippingAddresses.map((x) => x.id))
    const nextAddress: ShippingAddress = {
      id: selectedShippingId ?? createLocalAddressId(existingIds),
      label: shippingLabel.trim() || `地址 ${shippingAddresses.length + 1}`,
      name: shippingName.trim(),
      phone,
      region: shippingRegionText,
      provinceCode: shippingProvinceCode,
      cityCode: shippingCityCode,
      districtCode: shippingDistrictCode,
      detail: shippingDetail.trim(),
    }
    const nextAddresses = selectedShippingId
      ? shippingAddresses.map((x) => (x.id === selectedShippingId ? nextAddress : x))
      : [nextAddress, ...shippingAddresses]
    const dedupedNextAddresses = dedupeShippingAddressesById(nextAddresses)
    const nextProfile: ShippingProfileStore = {
      addresses: dedupedNextAddresses,
      defaultId: addressFormMode === 'create' ? nextAddress.id : (defaultShippingId ?? nextAddress.id),
    }
    setAddressActionLoading(true)
    setAddressError(null)
    try {
      if (isAuthenticated && apiConfigured) {
        let selfPub = await fetchUserEncryptionPublicKey(addr)
        if (!selfPub.encryption_public_key?.trim()) {
          if (!signMessage) throw new Error('需要钱包消息签名以初始化通讯加密')
          await ensureCommKeyReady({ walletAddress: addr, signMessage })
          selfPub = await fetchUserEncryptionPublicKey(addr)
        }
        const encPub = selfPub.encryption_public_key
        if (!encPub?.trim()) throw new Error('通讯加密公钥未就绪，请稍后重试')
        const encryptedPayload = {
          label: nextAddress.label,
          name: nextAddress.name,
          phone: nextAddress.phone,
          region: nextAddress.region,
          provinceCode: nextAddress.provinceCode,
          cityCode: nextAddress.cityCode,
          districtCode: nextAddress.districtCode,
          detail: nextAddress.detail,
        }
        const encrypted = await encryptShippingForSelf(encPub, JSON.stringify(encryptedPayload))
        const backendId = toBackendAddressId(selectedShippingId)
        if (addressFormMode === 'edit' && backendId) {
          await updateMyShippingAddress(backendId, {
            ...encrypted,
          })
        } else if (addressFormMode === 'edit' && !backendId) {
          throw new Error('当前地址不是数据库记录，无法直接修改。请删除后重新新增。')
        } else {
          const shouldSetDefault = shippingAddresses.length === 0
          await createMyShippingAddress({
            ...encrypted,
            is_default: shouldSetDefault,
          })
        }
        const latest = await fetchMyShippingAddresses()
        const mapped = dedupeShippingAddressesById(await Promise.all(
          latest.addresses.map(async (row) => {
            const plain = await decryptShippingForMe(row, addr)
            return { id: String(row.id), ...plain }
          }),
        ))
        const defaultId = String(latest.addresses.find((x) => x.is_default)?.id ?? mapped[0]?.id ?? '')
        const resolvedDefault = mapped.find((x) => x.id === defaultId)?.id ?? mapped[0]?.id ?? null
        setShippingAddresses(mapped)
        setDefaultShippingId(resolvedDefault)
        setSelectedShippingId(resolvedDefault)
        toLocalStorageProfile(mapped, resolvedDefault)
      } else {
        toLocalStorageProfile(dedupedNextAddresses, nextProfile.defaultId)
        setShippingAddresses(dedupedNextAddresses)
        setDefaultShippingId(nextProfile.defaultId)
      }
      setAddressHint(selectedShippingId ? '地址已更新。' : '地址已新增。')
      setAddressFormMode('hidden')
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : '地址保存失败')
    } finally {
      setAddressActionLoading(false)
    }
  }

  async function handleDeleteShippingAddressById(id: string) {
    if (!profileShippingStorageKey) return
    setAddressActionLoading(true)
    setAddressError(null)
    try {
      const backendId = toBackendAddressId(id)
      if (isAuthenticated && apiConfigured && backendId) {
        await deleteMyShippingAddress(backendId)
        const latest = await fetchMyShippingAddresses()
        const mapped = dedupeShippingAddressesById(await Promise.all(
          latest.addresses.map(async (row) => {
            const plain = await decryptShippingForMe(row, addr)
            return { id: String(row.id), ...plain }
          }),
        ))
        const defaultId = String(latest.addresses.find((x) => x.is_default)?.id ?? mapped[0]?.id ?? '')
        const resolvedDefault = mapped.find((x) => x.id === defaultId)?.id ?? mapped[0]?.id ?? null
        setShippingAddresses(mapped)
        setDefaultShippingId(resolvedDefault)
        setSelectedShippingId(resolvedDefault)
        if (mapped[0]) fillShippingForm(mapped[0])
        else resetShippingForm()
        toLocalStorageProfile(mapped, resolvedDefault)
      } else {
        const nextAddresses = shippingAddresses.filter((x) => x.id !== id)
        const nextDefaultId = nextAddresses[0]?.id ?? null
        toLocalStorageProfile(nextAddresses, nextDefaultId)
        setShippingAddresses(nextAddresses)
        setSelectedShippingId(nextDefaultId)
        setDefaultShippingId(nextDefaultId)
        if (nextAddresses[0]) fillShippingForm(nextAddresses[0])
        else resetShippingForm()
      }
      setAddressHint('地址已删除。')
      if (selectedShippingId === id) setAddressFormMode('hidden')
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : '删除地址失败')
    } finally {
      setAddressActionLoading(false)
    }
  }

  function requestDeleteShippingAddress(id: string) {
    setPendingDeleteShippingId(id)
  }

  function confirmDeleteShippingAddress() {
    if (!pendingDeleteShippingId) return
    void handleDeleteShippingAddressById(pendingDeleteShippingId)
    setPendingDeleteShippingId(null)
  }

  function handleCreateNewAddress() {
    setSelectedShippingId(null)
    resetShippingForm()
    setAddressFormMode('create')
    setAddressHint(null)
  }

  function handleEditShippingAddress(id: string) {
    const target = shippingAddresses.find((x) => x.id === id)
    if (!target) return
    setSelectedShippingId(id)
    fillShippingForm(target)
    setAddressFormMode('edit')
  }

  async function handleSetDefaultShippingAddress(id: string) {
    if (!profileShippingStorageKey) return
    setAddressActionLoading(true)
    setAddressError(null)
    try {
      const backendId = toBackendAddressId(id)
      if (isAuthenticated && apiConfigured && backendId) {
        await setDefaultMyShippingAddress(backendId)
      }
      toLocalStorageProfile(shippingAddresses, id)
      setDefaultShippingId(id)
      setAddressHint('已设置为默认地址。')
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : '设置默认地址失败')
    } finally {
      setAddressActionLoading(false)
    }
  }

  async function handleOpenAddressDialog() {
    if (!isAuthenticated || !publicKey || !signMessage || !localCommKeyStorageKey) return
    setAddressFormMode('hidden')
    setSelectedShippingId(null)
    setAddressActionLoading(true)
    setAddressError(null)
    try {
      const outcome = await ensureCommKeyReady({
        walletAddress: addr,
        signMessage,
      })
      if (outcome.status === 'skipped') {
        setAddressHint('已从本地加载通讯密钥。')
      } else if (outcome.status === 'restored') {
        setBackupPayload(outcome.backup)
        setBackupVersion(outcome.backup.backup_version)
        setAddressHint('已自动恢复本地通讯密钥。')
      } else {
        setBackupPayload(outcome.backup)
        setBackupVersion(outcome.backup.backup_version)
        setAddressHint('已自动创建加密备份，可在新设备通过钱包签名恢复。')
      }
      await refreshShippingAddressesFromSource()
      setAddressDialogOpen(true)
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : '初始化通讯密钥失败')
      setAddressDialogOpen(true)
    } finally {
      setAddressActionLoading(false)
    }
  }

  async function handleVerifyLogin() {
    if (!publicKey || !signMessage) return
    await login({ publicKey, signMessage })
  }

  async function handleSaveMyProfile() {
    const name = profileNameDraft.trim()
    if (!name) {
      setProfileError('昵称不能为空')
      return
    }
    if (name.length > 32) {
      setProfileError('昵称不能超过 32 个字符')
      return
    }
    setProfileSaving(true)
    setProfileError(null)
    try {
      await updateMyProfile({ username: name })
      await refreshSession()
      setProfileDialogOpen(false)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setProfileSaving(false)
    }
  }

  if (!publicKey) {
    return (
      <ProfileAccessState title="连接钱包" actionLabel="连接钱包" onAction={openWalletConnect} />
    )
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <ProfileAccessState
        title="验证登录"
        description={'已连接钱包，请先完成签名验证\n验证后可访问个人中心与收货地址'}
        actionLabel="验证登录"
        actionVariant="verify"
        onAction={() => {
          void handleVerifyLogin()
        }}
        loading={authLoading}
        errorText={authError}
      />
    )
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-5">

        {!apiConfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 leading-relaxed">
            连接后端认证：在 <span className="font-mono">.env.local</span> 设置{' '}
            <span className="font-mono">NEXT_PUBLIC_API_URL</span>（须含{' '}
            <span className="font-mono">:3005</span> 与 <span className="font-mono">/api</span>；本机示例{' '}
            <span className="font-mono">http://127.0.0.1:3005/api</span>，手机访问时请用电脑局域网 IP 替换主机名）与{' '}
            <span className="font-mono">NEXT_PUBLIC_USE_MOCK_DATA=false</span>
            ，刷新页面后会再次请求 <span className="font-mono">GET /auth/getme</span>{' '}
            恢复会话。
          </div>
        )}

        {/* 用户信息卡 */}
        <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
          {/* 顶部渐变条 */}
          <div className="h-16 bg-primary/10 relative">
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, oklch(0.72 0.19 145 / 0.15), oklch(0.72 0.19 145 / 0.05))' }}
            />
          </div>
          {/* 头像 + 信息 */}
          <div className="px-4 pb-4 -mt-8 flex items-end gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 border-2 border-card flex items-center justify-center shrink-0">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-primary">
                <circle cx="14" cy="10" r="5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 26c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <p className="font-bold text-foreground text-base">{displayName}</p>
              <button
                onClick={() => navigator.clipboard?.writeText(addr)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                aria-label="复制钱包地址"
              >
                <span className="font-mono">{short}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1.5 8.5V2a.5.5 0 01.5-.5h6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Devnet
              </span>
            </div>
            {/* 断开钱包 */}
            <button
              onClick={() => disconnect()}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors pb-1"
              aria-label="断开钱包连接"
            >
              断开
            </button>
          </div>

          {/* 数据统计 */}
          <div className="grid grid-cols-4 divide-x divide-border/50 border-t border-border/50">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center py-3 gap-0.5">
                <span className="font-bold text-sm text-foreground">{s.value}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 常用入口（移动端优先） */}
        <div className="grid grid-cols-2 gap-2.5 md:hidden">
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6.5 8h7M6.5 11h7M6.5 14h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="14.8" cy="13.8" r="1.1" fill="currentColor" />
                </svg>
              ),
              label: '订单',
              desc: '待发货/待收货/已完成',
              href: routes.pending,
              accent: true,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6.5 8h7M6.5 11h4.5M6.5 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              ),
              label: '链上记录',
              desc: '查看交易流水',
              href: routes.transactions,
              accent: false,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="11" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 8h5M6 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M14.5 6.5l2 1-2 1M14.5 11.5l2 1-2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              ),
              label: '书架',
              desc: '管理在售书籍',
              href: routes.shelf,
              accent: false,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 4A2 2 0 014.5 2h11A2 2 0 0117.5 4v7a2 2 0 01-2 2H11l-3.5 3V13H4.5a2 2 0 01-2-2V4z"
                    stroke="currentColor" strokeWidth="1.5"
                  />
                  <path d="M6.5 7h7M6.5 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ),
              label: '聊天',
              desc: '会话与未读',
              href: routes.chat,
              accent: false,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-150 active:scale-95',
                item.accent
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-card border-border/60 text-foreground hover:border-primary/30',
              ].join(' ')}
            >
              {item.icon}
              <div className="text-center">
                <p className="text-xs font-semibold leading-tight">{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* 书架 Tab */}
        <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
          {/* Tab 头 */}
          <div className="flex border-b border-border/60">
            {([
              { key: 'shelf' as ProfileTab, label: `我上架的 (${shelfBooks.length})` },
              { key: 'sold'  as ProfileTab, label: `我买到的 (${boughtBooks.length})` },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setProfileTab(t.key)}
                className={[
                  'flex-1 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  profileTab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 书籍列表 */}
          <div className="p-3 flex flex-col gap-2.5">
            {(profileTab === 'shelf' ? shelfBooks : boughtBooks).length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">暂无记录</p>
            ) : (
              (profileTab === 'shelf' ? shelfBooks : boughtBooks).map((book) => (
                <MiniBookCard key={book.id} book={book} />
              ))
            )}
          </div>

          {/* 查看全部 */}
          <Link
            href={routes.transactions}
            className="w-full py-3 border-t border-border/60 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
          >
            查看全部链上交易记录
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {/* 设置区 */}
        <div className="rounded-2xl bg-card border border-border/60 overflow-hidden divide-y divide-border/50">
          {[
            {
              label: '个人信息',
              icon: '👤',
              desc: '修改昵称，头像上传功能即将上线',
              onClick: () => {
                setProfileError(null)
                setProfileDialogOpen(true)
              },
            },
            {
              label: '收货地址',
              icon: '📦',
              desc: backupVersion
                ? '已保存收货信息'
                : '填写默认收货信息，下单可自动带入',
              onClick: () => {
                void handleOpenAddressDialog()
              },
            },
            { label: '订单提醒', icon: '🔔', desc: '买家提交地址后，可在订单里直接查看' },
            { label: '安全设置', icon: '🔒', desc: '自动锁定与隐私保护开关', onClick: () => setSecurityDialogOpen(true) },
            { label: '帮助与反馈', icon: '💬', desc: '联系支持团队' },
            { label: '关于 BookChain', icon: '📖', desc: '版本 0.1.0 · Solana Devnet' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40 transition-colors text-left"
            >
              <span className="text-base" role="img" aria-label={item.label}>{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.desc}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-muted-foreground shrink-0">
                <path d="M5 3.5L8.5 7 5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        {/* 断开连接 */}
        <button
          onClick={() => disconnect()}
          className="w-full py-3.5 rounded-2xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-colors"
        >
          断开钱包连接
        </button>

        <Dialog
          open={addressDialogOpen}
          onOpenChange={(open) => {
            setAddressDialogOpen(open)
            if (!open) {
              setAddressFormMode('hidden')
              setSelectedShippingId(null)
            }
          }}
        >
          <DialogContent className="max-w-[min(92vw,640px)]">
            <DialogHeader>
              <DialogTitle>收货地址</DialogTitle>
              <DialogDescription>
                填写你的收货信息。地址将采用加密存储，保护您的隐私，只有您自己和卖家能够查看您的收货地址。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {addressLoading && <p className="text-xs text-muted-foreground">正在准备地址安全能力…</p>}
              {addressActionLoading && <p className="text-xs text-muted-foreground">正在初始化安全能力，请稍候…</p>}
              {addressError && <p className="text-xs text-destructive">{addressError}</p>}
              <div className="rounded-xl border border-border/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">地址列表</p>
                {shippingAddresses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无地址，请先新增。</p>
                ) : (
                  <div className="space-y-2">
                    {shippingAddresses.map((item, index) => {
                      const isDefault = defaultShippingId === item.id
                      return (
                        <div key={`${item.id}-${index}`} className="rounded-md border border-border bg-background px-2.5 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-foreground">
                              {item.label}
                              {isDefault ? <span className="ml-1.5 text-primary">（默认）</span> : null}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => handleEditShippingAddress(item.id)}>
                                修改
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { requestDeleteShippingAddress(item.id) }}
                              >
                                删除
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { void handleSetDefaultShippingAddress(item.id) }}
                                disabled={isDefault}
                              >
                                设为默认
                              </Button>
                            </div>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{[item.name, item.region, item.detail].filter(Boolean).join('，')}</p>
                          <p className="mt-0.5 text-muted-foreground">手机号：{item.phone}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="pt-1">
                  <Button size="sm" variant="outline" onClick={handleCreateNewAddress}>新增地址</Button>
                </div>
              </div>
              {addressFormMode !== 'hidden' && (
                <div className="rounded-xl border border-border/60 p-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground">{addressFormMode === 'edit' ? '修改地址' : '新增地址'}</p>
                <input
                  value={shippingLabel}
                  onChange={(e) => setShippingLabel(e.target.value)}
                  placeholder="地址标签（如：家 / 公司）"
                  className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                />
                <input
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                  placeholder="收件人姓名"
                  className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                />
                <input
                  value={shippingPhone}
                  onChange={(e) => setShippingPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="手机号（11位）"
                  className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={shippingProvinceCode}
                    onChange={(e) => {
                      setShippingProvinceCode(e.target.value)
                      setShippingCityCode('')
                      setShippingDistrictCode('')
                    }}
                    className="h-9 rounded-md bg-input border border-border px-2 text-xs"
                  >
                    <option value="">省</option>
                    {provinceOptions.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={shippingCityCode}
                    onChange={(e) => {
                      setShippingCityCode(e.target.value)
                      setShippingDistrictCode('')
                    }}
                    className="h-9 rounded-md bg-input border border-border px-2 text-xs"
                    disabled={!shippingProvinceCode}
                  >
                    <option value="">市</option>
                    {cityOptions.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={shippingDistrictCode}
                    onChange={(e) => setShippingDistrictCode(e.target.value)}
                    className="h-9 rounded-md bg-input border border-border px-2 text-xs"
                    disabled={!shippingCityCode}
                  >
                    <option value="">区/县</option>
                    {districtOptions.map((d) => (
                      <option key={d.code} value={d.code}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={3}
                  value={shippingDetail}
                  onChange={(e) => setShippingDetail(e.target.value)}
                  placeholder="详细地址（街道、门牌、楼栋、房号）"
                  className="w-full rounded-md bg-input border border-border px-2 py-1.5 text-xs"
                />
                <Button
                  size="sm"
                  disabled={
                    !shippingName.trim() ||
                    !/^\d{11}$/.test(shippingPhone.trim()) ||
                    !shippingProvinceCode ||
                    !shippingCityCode ||
                    !shippingDistrictCode ||
                    !shippingDetail.trim()
                  }
                  onClick={() => { void handleSaveShippingProfile() }}
                >
                  {addressFormMode === 'edit' ? '更新地址' : '保存地址'}
                </Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAddressFormMode('hidden')}>
                    取消
                  </Button>
                  {addressFormMode === 'edit' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedShippingId) requestDeleteShippingAddress(selectedShippingId)
                      }}
                      disabled={!selectedShippingId}
                    >
                      删除地址
                    </Button>
                  ) : null}
                </div>
              </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setAddressDialogOpen(false)}>关闭</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(pendingDeleteShippingId)} onOpenChange={(open) => { if (!open) setPendingDeleteShippingId(null) }}>
          <DialogContent className="max-w-[min(92vw,420px)]">
            <DialogHeader>
              <DialogTitle>确认删除地址？</DialogTitle>
              <DialogDescription>
                删除后不可恢复。若删除的是默认地址，系统会自动选择下一条地址为默认地址。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDeleteShippingId(null)} disabled={addressActionLoading}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDeleteShippingAddress} disabled={addressActionLoading}>
                {addressActionLoading ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent className="max-w-[min(92vw,560px)]">
            <DialogHeader>
              <DialogTitle>我的信息</DialogTitle>
              <DialogDescription>可修改昵称。头像先占位，后续接入 OSS 上传。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="avatar preview" width={56} height={56} className="object-cover w-full h-full" />
                  ) : (
                    <span className="text-xs text-muted-foreground">头像</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => avatarFileRef.current?.click()}>
                    选择头像（占位）
                  </Button>
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const reader = new FileReader()
                      reader.onload = (ev) => setProfileAvatarPreview(ev.target?.result as string)
                      reader.readAsDataURL(f)
                    }}
                  />
                </div>
              </div>
              <input
                value={profileNameDraft}
                onChange={(e) => setProfileNameDraft(e.target.value)}
                placeholder="请输入昵称（最多 32 字）"
                className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
              />
              {profileError ? <p className="text-xs text-destructive">{profileError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setProfileDialogOpen(false)} disabled={profileSaving}>取消</Button>
                <Button onClick={handleSaveMyProfile} disabled={profileSaving}>{profileSaving ? '保存中...' : '保存'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={securityDialogOpen} onOpenChange={setSecurityDialogOpen}>
          <DialogContent className="max-w-[min(92vw,520px)]">
            <DialogHeader>
              <DialogTitle>安全设置</DialogTitle>
              <DialogDescription>本地安全偏好设置（不上传服务器）。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span>离开页面后自动锁定敏感操作</span>
                <input type="checkbox" checked={securityAutoLock} onChange={(e) => setSecurityAutoLock(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>默认隐藏订单中的完整地址明文</span>
                <input type="checkbox" checked={securityHideAddress} onChange={(e) => setSecurityHideAddress(e.target.checked)} />
              </label>
            </div>
          </DialogContent>
        </Dialog>

        {addressHint ? (
          <div className="fixed top-4 left-1/2 z-[120] -translate-x-1/2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary shadow-sm">
            {addressHint}
          </div>
        ) : null}

      </div>
    </div>
  )
}
