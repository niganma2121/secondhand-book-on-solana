'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bookPublicHistory, routes } from '@/config/routes'
import { fetchMyAssetEscrowEvents, type MyEscrowEventRow } from '@/lib/api/book-history'
import { ApiError } from '@/lib/api/client'
import { env } from '@/lib/env'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/solana-explorer'

function formatTime(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleString('zh-CN')
  } catch {
    return String(ts)
  }
}

export function ShelfMyEscrowTradesPage({ asset }: { asset: string }) {
  const { publicKey } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<MyEscrowEventRow[]>([])

  const load = useCallback(async () => {
    if (!asset || !env.apiBaseUrl) {
      setError('缺少书籍标识或未配置 API')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchMyAssetEscrowEvents(asset, 1, 100)
      setEvents(res.events ?? [])
    } catch (e) {
      setEvents([])
      setError(e instanceof ApiError ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [asset])

  useEffect(() => {
    if (!publicKey) {
      setLoading(false)
      setEvents([])
      setError(null)
      return
    }
    void load()
  }, [load, publicKey])

  if (!publicKey) {
    return (
      <div className="pb-28 md:pb-12">
        <div className="max-w-lg mx-auto px-5 sm:px-8 pt-10 flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground text-center">请先连接钱包以查看你与该书的托管流水。</p>
          <Button onClick={openWalletConnect}>连接钱包</Button>
          <Button variant="outline" asChild>
            <Link href={routes.shelf}>返回书架</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-28 md:pb-12">
      <div className="max-w-lg mx-auto px-5 sm:px-8 pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">我的托管流水</h1>
            <p className="text-xs text-muted-foreground mt-1">
              仅展示你作为买家或卖家参与的记录；含完整地址。
            </p>
            <p className="text-xs text-muted-foreground mt-1 break-all font-mono">{asset}</p>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href={routes.shelf}>返回书架</Link>
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="h-8 px-0 text-primary" asChild>
          <Link href={bookPublicHistory(asset)}>查看公开本书流转（脱敏）</Link>
        </Button>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            加载中…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">暂无与你相关的托管事件</p>
        )}

        {!loading && !error && events.length > 0 && (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{ev.action}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {formatTime(ev.created_at)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="break-all">
                    卖家：<span className="font-mono text-foreground/90">{ev.seller}</span>
                  </p>
                  <p className="break-all">
                    买家：<span className="font-mono text-foreground/90">{ev.buyer}</span>
                  </p>
                  <p>
                    状态：{ev.from_state ?? '—'} → {ev.to_state}
                  </p>
                  <p className="font-mono break-all">托管 PDA：{ev.escrow_pda}</p>
                  {ev.actor_pubkey && (
                    <p className="break-all">
                      操作者：<span className="font-mono">{ev.actor_pubkey}</span>
                    </p>
                  )}
                </div>
                {ev.tx_signature && (
                  <a
                    href={explorerTxUrl(ev.tx_signature)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    查看交易 {ev.tx_signature.slice(0, 8)}…
                  </a>
                )}
                <a
                  href={explorerAddressUrl(ev.escrow_pda)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:underline block"
                >
                  在浏览器中打开托管账户
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
