'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useWallet } from '@solana/wallet-adapter-react'
import { ChainTransaction } from '@/lib/types'
import { useTransactions, type TxScope } from '@/lib/hooks/use-transactions'
import { privacyPubkey } from '@/lib/format-seller'
import { useAuth } from '@/components/providers/auth-provider'
import { fetchOrderShippingCipher } from '@/lib/api/shipping-cipher'
import { useSolCnyRate } from '@/lib/hooks/use-sol-cny-rate'

const TYPE_LABELS: Record<ChainTransaction['type'], string> = {
  buy: '购买',
  sell: '出售',
  list: '上架',
  delist: '下架',
}

const TYPE_COLORS: Record<ChainTransaction['type'], string> = {
  buy: 'text-primary bg-primary/10',
  sell: 'text-yellow-400 bg-yellow-400/10',
  list: 'text-blue-400 bg-blue-400/10',
  delist: 'text-muted-foreground bg-secondary',
}

const STATUS_CONFIG: Record<
  ChainTransaction['status'],
  { label: string; dot: string; text: string }
> = {
  confirmed: { label: '已确认', dot: 'bg-primary', text: 'text-primary' },
  processing: { label: '确认中', dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400' },
  failed: { label: '失败', dot: 'bg-destructive', text: 'text-destructive' },
}

const FILTER_OPTIONS: { label: string; value: ChainTransaction['status'] | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '已确认', value: 'confirmed' },
  { label: '确认中', value: 'processing' },
  { label: '失败', value: 'failed' },
]

const SCOPE_OPTIONS: { label: string; value: TxScope }[] = [
  { label: '我的记录', value: 'mine' },
  { label: '链上记录', value: 'program' },
]

function shortenSig(sig: string) {
  if (sig.includes('...')) return sig
  return `${sig.slice(0, 6)}...${sig.slice(-4)}`
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256(data: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

async function decryptShippingCipherForSeller(
  sellerCiphertext: string,
  sellerNonce: string,
  sellerPubkey: string,
) {
  const key = localStorage.getItem(`bookchain:comm-key:${sellerPubkey}`)
  if (!key) throw new Error('本地通讯私钥不存在，请先到个人中心完成自动恢复。')
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
  const aesRaw = await sha256(keySeed)
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, base64ToBytes(parsed.ct))
  return new TextDecoder().decode(plain)
}

function TxCard({ tx, myPubkey }: { tx: ChainTransaction; myPubkey?: string }) {
  const [copied, setCopied] = useState(false)
  const [decrypting, setDecrypting] = useState(false)
  const [shippingPlaintext, setShippingPlaintext] = useState<string | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [shippingHint, setShippingHint] = useState<string | null>(null)

  const status = STATUS_CONFIG[tx.status]
  const explorerHref =
    tx.transactionLinkKind === 'account'
      ? `https://explorer.solana.com/address/${encodeURIComponent(tx.signature)}?cluster=devnet`
      : `https://explorer.solana.com/tx/${encodeURIComponent(tx.signature)}?cluster=devnet`

  async function handleCopy() {
    await navigator.clipboard.writeText(tx.signature)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const canDecryptShipping =
    Boolean(myPubkey) &&
    tx.type === 'sell' &&
    tx.transactionLinkKind === 'account' &&
    tx.signature.length > 40
  async function handleDecryptShipping() {
    if (!myPubkey || !canDecryptShipping) return
    setDecrypting(true)
    setShippingError(null)
    setShippingHint(null)
    try {
      const payload = await fetchOrderShippingCipher(tx.signature)
      const plain = await decryptShippingCipherForSeller(
        payload.seller_ciphertext,
        payload.seller_nonce,
        myPubkey,
      )
      setShippingPlaintext(plain)
    } catch (e) {
      setShippingError(e instanceof Error ? e.message : '解密失败')
    } finally {
      setDecrypting(false)
    }
  }

  const showCover = Boolean(tx.bookCover?.trim())

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex gap-3">
      {/* 封面：与右侧信息垂直居中对齐，避免压在卡片底部 */}
      <div className="relative w-[76px] aspect-[3/4] shrink-0 self-center overflow-hidden rounded-lg bg-secondary ring-1 ring-border/60">
        {showCover ? (
          <Image
            src={tx.bookCover!}
            alt=""
            fill
            sizes="76px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-1 text-center">
            <span className="text-[10px] leading-tight text-muted-foreground">暂无封面</span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* 顶部行 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={['shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold', TYPE_COLORS[tx.type]].join(' ')}>
              {TYPE_LABELS[tx.type]}
            </span>
            <span className="truncate text-sm font-medium text-foreground">{tx.bookTitle}</span>
          </div>
          <div className={['flex shrink-0 items-center gap-1.5', status.text].join(' ')}>
            <span className={['h-1.5 w-1.5 rounded-full', status.dot].join(' ')} />
            <span className="text-[11px] font-medium">{status.label}</span>
          </div>
        </div>

        {/* 签名 + 复制 */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{shortenSig(tx.signature)}</span>
          <button
            onClick={handleCopy}
            aria-label="复制交易签名"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M2 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <rect x="4" y="4" width="7.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 3V2a1 1 0 011-1h5.5a1 1 0 011 1v5.5a1 1 0 01-1 1H9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-muted-foreground transition-colors hover:text-primary"
            aria-label={
              tx.transactionLinkKind === 'account'
                ? '在 Solana Explorer 查看托管账户'
                : '在 Solana Explorer 查看交易'
            }
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M7.5 1.5H11.5V5.5M11.5 1.5L6 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M5 3H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </a>
        </div>

        {/* 详细信息网格 */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {tx.amount > 0 && (
            <>
              <span className="text-muted-foreground">金额</span>
              <span className="font-mono font-semibold text-primary">{tx.amount} SOL</span>
            </>
          )}
          <span className="text-muted-foreground">区块槽</span>
          <span className="font-mono text-foreground">{tx.slot.toLocaleString()}</span>
          <span className="text-muted-foreground">Gas 费</span>
          <span className="font-mono text-foreground">
            {tx.fee === 0 ? '—' : `${tx.fee.toLocaleString()} lamports`}
          </span>
          <span className="text-muted-foreground">时间</span>
          <span className="text-foreground">{tx.timestamp}</span>
        </div>

        {tx.type !== 'list' && tx.type !== 'delist' && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5 text-xs">
            <div>
              <p className="mb-0.5 text-muted-foreground">买方</p>
              <p className="font-mono text-foreground">{privacyPubkey(tx.from)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-muted-foreground">卖方</p>
              <p className="font-mono text-foreground">{privacyPubkey(tx.to)}</p>
            </div>
          </div>
        )}
        {canDecryptShipping && (
          <div className="border-t border-border pt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">订单收货地址（端到端加密）</p>
              <button
                type="button"
                onClick={handleDecryptShipping}
                disabled={decrypting}
                className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {decrypting ? '读取中...' : '查看买家收货地址'}
              </button>
            </div>
            {shippingPlaintext ? (
              <div className="rounded-md bg-secondary/50 px-2.5 py-2 text-xs text-foreground whitespace-pre-wrap">
                {shippingPlaintext}
              </div>
            ) : null}
            {shippingError ? (
              <p className="text-xs text-destructive">{shippingError}</p>
            ) : null}
            {shippingHint ? (
              <p className="text-xs text-primary">{shippingHint}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export function TransactionsPage() {
  const { publicKey } = useWallet()
  const { sessionStatus, isAuthenticated } = useAuth()
  const { cnyPerSol, loading: cnyRateLoading } = useSolCnyRate()
  const [scope, setScope] = useState<TxScope>('program')
  const [scopeTouched, setScopeTouched] = useState(false)
  const { transactions, loading, error, unauthorized } = useTransactions(scope)
  const [filter, setFilter] = useState<ChainTransaction['status'] | 'all'>('all')
  const showStatusFilters = scope !== 'program'

  useEffect(() => {
    if (scopeTouched) return
    if (sessionStatus === 'loading') return
    setScope(isAuthenticated ? 'mine' : 'program')
  }, [isAuthenticated, scopeTouched, sessionStatus])

  const effectiveFilter = showStatusFilters ? filter : 'all'
  const displayed = effectiveFilter === 'all'
    ? transactions
    : transactions.filter((t) => t.status === effectiveFilter)

  const stats = {
    total: transactions.length,
    confirmed: transactions.filter((t) => t.status === 'confirmed').length,
    volume: transactions.filter((t) => t.type === 'buy' || t.type === 'sell')
      .reduce((sum, t) => sum + t.amount, 0)
      .toFixed(3),
  }

  const volumeSolNum = Number.parseFloat(stats.volume)
  const volumeCnyApprox =
    cnyPerSol != null && Number.isFinite(volumeSolNum) ? volumeSolNum * cnyPerSol : null

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* 标题 */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">链上交易记录</h1>
        </div>

        {/* 范围：默认未登录=链上记录，登录=我的记录；用户可手动切换 */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setScopeTouched(true)
                setScope(opt.value)
              }}
              className={[
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                scope === opt.value
                  ? 'bg-secondary text-foreground border-primary/40'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">全部交易</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-primary">{stats.confirmed}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">已确认</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-foreground font-mono leading-snug break-all px-0.5">
              {volumeCnyApprox != null ? (
                <>
                  ¥{volumeCnyApprox.toFixed(2)} / {stats.volume} SOL
                </>
              ) : (
                <>{stats.volume} SOL</>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {volumeCnyApprox != null
                ? '人民币约合 / SOL 数量'
                : cnyRateLoading
                  ? '正在获取汇率…'
                  : '总额 SOL'}
            </p>
          </div>
        </div>

        {/* 状态筛选（链上记录模式不展示） */}
        {showStatusFilters && (
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  filter === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error.message}
          </div>
        )}

        {/* 交易列表 */}
        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">加载中…</div>
        ) : unauthorized ? (
          <div className="flex min-h-[min(52vh,480px)] flex-col items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground gap-2">
            <p>查看「我的记录」请先使用右上角登录（钱包签名）。</p>
            <p className="text-xs">也可切换到「链上记录」浏览公开托管流水。</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex min-h-[min(52vh,480px)] flex-col items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground">
            暂无交易记录
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {displayed.map((tx) => (
              <TxCard key={tx.signature} tx={tx} myPubkey={publicKey?.toBase58()} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
