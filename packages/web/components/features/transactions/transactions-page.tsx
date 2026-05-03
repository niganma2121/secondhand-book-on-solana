'use client'

import { useState } from 'react'
import { ChainTransaction } from '@/lib/types'
import { useTransactions } from '@/lib/hooks/use-transactions'

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

function shortenSig(sig: string) {
  if (sig.includes('...')) return sig
  return `${sig.slice(0, 6)}...${sig.slice(-4)}`
}

function TxCard({ tx }: { tx: ChainTransaction }) {
  const [copied, setCopied] = useState(false)
  const status = STATUS_CONFIG[tx.status]

  async function handleCopy() {
    await navigator.clipboard.writeText(tx.signature)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      {/* 顶部行 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={['text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0', TYPE_COLORS[tx.type]].join(' ')}>
            {TYPE_LABELS[tx.type]}
          </span>
          <span className="text-sm font-medium text-foreground truncate">{tx.bookTitle}</span>
        </div>
        {/* 状态 */}
        <div className={['flex items-center gap-1.5 shrink-0', status.text].join(' ')}>
          <span className={['w-1.5 h-1.5 rounded-full', status.dot].join(' ')} />
          <span className="text-[11px] font-medium">{status.label}</span>
        </div>
      </div>

      {/* 签名 + 复制 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono">{shortenSig(tx.signature)}</span>
        <button
          onClick={handleCopy}
          aria-label="复制交易签名"
          className="text-muted-foreground hover:text-foreground transition-colors"
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
          href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors ml-auto"
          aria-label="在 Solana Explorer 查看"
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
            <span className="text-foreground font-mono font-semibold text-primary">{tx.amount} SOL</span>
          </>
        )}
        <span className="text-muted-foreground">区块槽</span>
        <span className="text-foreground font-mono">{tx.slot.toLocaleString()}</span>
        <span className="text-muted-foreground">Gas 费</span>
        <span className="text-foreground font-mono">
          {tx.fee === 0 ? '—' : `${tx.fee.toLocaleString()} lamports`}
        </span>
        <span className="text-muted-foreground">时间</span>
        <span className="text-foreground">{tx.timestamp}</span>
      </div>

      {/* 地址行（仅有 from/to 时显示） */}
      {tx.type !== 'list' && tx.type !== 'delist' && (
        <div className="border-t border-border pt-2.5 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">发送方</p>
            <p className="font-mono text-foreground truncate">{tx.from}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">接收方</p>
            <p className="font-mono text-foreground truncate">{tx.to}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function TransactionsPage() {
  const { transactions, loading } = useTransactions()
  const [filter, setFilter] = useState<ChainTransaction['status'] | 'all'>('all')

  const displayed = filter === 'all'
    ? transactions
    : transactions.filter((t) => t.status === filter)

  const stats = {
    total: transactions.length,
    confirmed: transactions.filter((t) => t.status === 'confirmed').length,
    volume: transactions.filter((t) => t.type === 'buy' || t.type === 'sell')
      .reduce((sum, t) => sum + t.amount, 0)
      .toFixed(3),
  }

  return (
    <div className="pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* 标题 */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">链上交易记录</h1>
          <p className="text-sm text-muted-foreground mt-0.5">所有交易数据永久上链，公开可查</p>
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
            <p className="text-lg font-bold text-foreground font-mono">{stats.volume}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">总额 SOL</p>
          </div>
        </div>

        {/* 状态筛选 */}
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

        {/* 交易列表 */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">加载中…</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">暂无交易记录</div>
        ) : (
          <div className="flex flex-col gap-3">
            {displayed.map((tx) => (
              <TxCard key={tx.signature} tx={tx} />
            ))}
          </div>
        )}

        {/* Devnet 提示 */}
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          当前网络: Solana Devnet。点击交易签名可在 Solana Explorer 查看完整链上数据。
        </div>
      </div>
    </div>
  )
}
