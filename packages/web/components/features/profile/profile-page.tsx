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
  upsertMyEncryptionBackup,
  type EncryptionTemplate,
  type MyEncryptionBackup,
} from '@/lib/api/encryption'

type ProfileTab = 'shelf' | 'sold'

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

export function ProfilePage() {
  const { publicKey, disconnect, signMessage } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [profileTab, setProfileTab] = useState<ProfileTab>('shelf')
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false)
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false)
  const [templates, setTemplates] = useState<EncryptionTemplate[]>([])
  const [backupPayload, setBackupPayload] = useState<MyEncryptionBackup | null>(null)
  const [backupVersion, setBackupVersion] = useState<string | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressActionLoading, setAddressActionLoading] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressHint, setAddressHint] = useState<string | null>(null)
  const autoProvisionTriedRef = useRef(false)
  const [shippingName, setShippingName] = useState('')
  const [shippingPhone, setShippingPhone] = useState('')
  const [shippingProvinceCode, setShippingProvinceCode] = useState('')
  const [shippingCityCode, setShippingCityCode] = useState('')
  const [shippingDistrictCode, setShippingDistrictCode] = useState('')
  const [shippingDetail, setShippingDetail] = useState('')
  const [profileNameDraft, setProfileNameDraft] = useState('')
  const [profileAvatarPreview, setProfileAvatarPreview] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [securityAutoLock, setSecurityAutoLock] = useState(true)
  const [securityHideAddress, setSecurityHideAddress] = useState(true)
  const [privacyMaskPhone, setPrivacyMaskPhone] = useState(true)
  const [privacyOnlyOrderParties, setPrivacyOnlyOrderParties] = useState(true)
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const {
    user,
    isAuthenticated,
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
  const localCommKeyStorageKey = addr ? `bookchain:comm-key:${addr}` : ''
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

  useEffect(() => {
    setProfileNameDraft(user?.username ?? '')
  }, [user?.username])

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

  function fillMessageTemplate(tpl: string, pubkey: string) {
    return tpl.replaceAll('{pubkey}', pubkey).replaceAll('{origin}', window.location.origin)
  }

  async function deriveAesKey(signature: Uint8Array, salt: Uint8Array) {
    const merged = new Uint8Array(signature.length + salt.length)
    merged.set(signature, 0)
    merged.set(salt, signature.length)
    const digest = await crypto.subtle.digest('SHA-256', merged)
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }

  async function createBackup(template: EncryptionTemplate) {
    if (!publicKey || !signMessage || !localCommKeyStorageKey) return
    setAddressActionLoading(true)
    try {
      const keyPair = (await crypto.subtle.generateKey(
        { name: 'X25519' } as EcKeyGenParams,
        true,
        ['deriveBits'],
      )) as CryptoKeyPair
      const exportedPub = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
      const exportedPriv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey))
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const msg = fillMessageTemplate(template.message_template, publicKey.toBase58())
      const sig = await signMessage(new TextEncoder().encode(msg))
      const aes = await deriveAesKey(sig, salt)
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, exportedPriv)
      await upsertMyEncryptionBackup({
        backup_version: template.version,
        encryption_public_key: bytesToBase64(exportedPub),
        encrypted_private_key: bytesToBase64(new Uint8Array(encrypted)),
        nonce: bytesToBase64(iv),
        kdf_salt: bytesToBase64(salt),
        kdf_params: template.kdf_params,
      })
      const saved = await fetchMyEncryptionBackup()
      localStorage.setItem(localCommKeyStorageKey, bytesToBase64(exportedPriv))
      setBackupVersion(saved.backup_version)
      setAddressHint('已自动创建加密备份，可在新设备通过钱包签名恢复。')
      setBackupPayload(saved)
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : '自动创建加密备份失败')
    } finally {
      setAddressActionLoading(false)
    }
  }

  async function restoreBackup() {
    if (!publicKey || !signMessage || !backupPayload || !localCommKeyStorageKey) return
    if (localStorage.getItem(localCommKeyStorageKey)) return
    const tpl = templates.find((x) => x.version === backupPayload.backup_version)
    if (!tpl) return
    setAddressActionLoading(true)
    try {
      const msg = fillMessageTemplate(tpl.message_template, publicKey.toBase58())
      const sig = await signMessage(new TextEncoder().encode(msg))
      const aes = await deriveAesKey(sig, base64ToBytes(backupPayload.kdf_salt))
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(backupPayload.nonce) },
        aes,
        base64ToBytes(backupPayload.encrypted_private_key),
      )
      localStorage.setItem(localCommKeyStorageKey, bytesToBase64(new Uint8Array(plain)))
      setAddressHint('已自动恢复本地通讯密钥。')
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : '自动恢复密钥失败')
    } finally {
      setAddressActionLoading(false)
    }
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
        const [tplRes, backupRes] = await Promise.all([
          fetchEncryptionTemplates(),
          fetchMyEncryptionBackup().catch((err) => {
            if (err instanceof ApiError && err.status === 404) return null
            throw err
          }),
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
        if (profileShippingStorageKey) {
          const raw = localStorage.getItem(profileShippingStorageKey)
          if (raw) {
            const parsed = JSON.parse(raw) as {
              name?: string
              phone?: string
              region?: string
              provinceCode?: string
              cityCode?: string
              districtCode?: string
              detail?: string
            }
            setShippingName(parsed.name ?? '')
            setShippingPhone(parsed.phone ?? '')
            setShippingProvinceCode(parsed.provinceCode ?? '')
            setShippingCityCode(parsed.cityCode ?? '')
            setShippingDistrictCode(parsed.districtCode ?? '')
            setShippingDetail(parsed.detail ?? '')
          }
        }
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

  function handleSaveShippingProfile() {
    if (!profileShippingStorageKey) return
    localStorage.setItem(
      profileShippingStorageKey,
      JSON.stringify({
        name: shippingName.trim(),
        phone: shippingPhone.trim(),
        region: shippingRegionText,
        provinceCode: shippingProvinceCode,
        cityCode: shippingCityCode,
        districtCode: shippingDistrictCode,
        detail: shippingDetail.trim(),
      }),
    )
    setAddressHint('收货信息已保存。下单时会自动带入，你也可以按订单修改。')
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

  useEffect(() => {
    if (!isAuthenticated || !publicKey || !signMessage) return
    if (addressLoading || addressActionLoading) return
    if (autoProvisionTriedRef.current) return
    autoProvisionTriedRef.current = true
    if (backupPayload) {
      void restoreBackup()
      return
    }
    const tpl = templates[0]
    if (tpl) void createBackup(tpl)
  }, [isAuthenticated, publicKey, signMessage, addressLoading, addressActionLoading, backupPayload, templates])

  // 未连接钱包
  if (!publicKey) {
    return (
      <div className="pb-24 md:pb-10 min-h-[60vh] flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-20 h-20 rounded-3xl bg-card border border-border/60 flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="text-muted-foreground">
            <circle cx="18" cy="13" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5 32c0-7.18 5.82-13 13-13s13 5.82 13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-foreground">连接钱包</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            连接 Phantom 或 Solflare 钱包<br />查看你的链上书架与交易记录
          </p>
        </div>
        <Button
          onClick={openWalletConnect}
          className="bg-primary text-primary-foreground h-11 px-8 rounded-xl font-semibold"
        >
          连接钱包
        </Button>
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-5">

        {!apiConfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 leading-relaxed">
            连接后端认证：在 <span className="font-mono">.env.local</span> 设置{' '}
            <span className="font-mono">NEXT_PUBLIC_API_URL</span>（如{' '}
            <span className="font-mono">http://127.0.0.1:3005/api</span>）与{' '}
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

        {/* 快捷操作 */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ),
              label: '上架书籍',
              desc: '铸造 NFT',
              href: routes.list,
              accent: true,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="2" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 6V4a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ),
              label: '逛书市',
              desc: '发现好书',
              href: routes.market,
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
              desc: '与卖家沟通',
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
              onClick: () => setAddressDialogOpen(true),
            },
            { label: '订单提醒', icon: '🔔', desc: '买家提交地址后，可在订单里直接查看' },
            { label: '安全设置', icon: '🔒', desc: '自动锁定与隐私保护开关', onClick: () => setSecurityDialogOpen(true) },
            { label: '隐私设置', icon: '🛡️', desc: '手机号脱敏与订单可见范围', onClick: () => setPrivacyDialogOpen(true) },
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

        <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
          <DialogContent className="max-w-[min(92vw,640px)]">
            <DialogHeader>
              <DialogTitle>收货地址</DialogTitle>
              <DialogDescription>
                填写你的默认收货信息。我们采用加密存储，保护您的隐私，只有您自己和卖家能够查看您的收货地址。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {addressLoading && <p className="text-xs text-muted-foreground">正在准备地址安全能力…</p>}
              {addressActionLoading && <p className="text-xs text-muted-foreground">正在初始化安全能力，请稍候…</p>}
              {addressHint && <p className="text-xs text-primary">{addressHint}</p>}
              {addressError && <p className="text-xs text-destructive">{addressError}</p>}
              <div className="rounded-xl border border-border/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">默认收货信息</p>
                <input
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                  placeholder="收件人姓名"
                  className="w-full h-9 rounded-md bg-input border border-border px-2 text-xs"
                />
                <input
                  value={shippingPhone}
                  onChange={(e) => setShippingPhone(e.target.value)}
                  placeholder="手机号"
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
                    !shippingPhone.trim() ||
                    !shippingProvinceCode ||
                    !shippingCityCode ||
                    !shippingDistrictCode ||
                    !shippingDetail.trim()
                  }
                  onClick={handleSaveShippingProfile}
                >
                  保存收货信息
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setAddressDialogOpen(false)}>关闭</Button>
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

        <Dialog open={privacyDialogOpen} onOpenChange={setPrivacyDialogOpen}>
          <DialogContent className="max-w-[min(92vw,520px)]">
            <DialogHeader>
              <DialogTitle>隐私设置</DialogTitle>
              <DialogDescription>交易地址与联系方式的显示策略。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span>手机号默认脱敏显示</span>
                <input type="checkbox" checked={privacyMaskPhone} onChange={(e) => setPrivacyMaskPhone(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>仅订单相关双方可见完整地址</span>
                <input type="checkbox" checked={privacyOnlyOrderParties} onChange={(e) => setPrivacyOnlyOrderParties(e.target.checked)} />
              </label>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}
