'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bookPublicHistory, routes } from '@/config/routes'
import { fetchBookDetail } from '@/lib/api/book-detail'
import { fetchMyAssetEscrowEvents, type MyEscrowEventRow } from '@/lib/api/book-history'
import { ApiError } from '@/lib/api/client'
import { env } from '@/lib/env'
import {
  escrowActionTitle,
  escrowStateZh,
  groupMyEscrowEventsByPda,
  isEscrowActionAlert,
} from '@/lib/escrow-event-copy'
import { shortenPubkey } from '@/lib/format-seller'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/solana-explorer'

function formatTime(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
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
  const [bookName, setBookName] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!asset || !env.apiBaseUrl) {
      setError('缺少书籍标识或未配置 API')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setBookName(null)
    try {
      const [res, detail] = await Promise.all([
        fetchMyAssetEscrowEvents(asset, 1, 100),
        fetchBookDetail(asset).catch(() => null),
      ])
      setEvents(res.events ?? [])
      setBookName(detail?.book?.name?.trim() ? detail.book.name.trim() : null)
    } catch (e) {
      setEvents([])
      setBookName(null)
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

  const groups = useMemo(() => groupMyEscrowEventsByPda(events), [events])

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
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-5 lg:px-8 pt-6 md:pt-10 space-y-5 md:space-y-7">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-bold text-foreground tracking-tight">
              {bookName ? `${bookName} · 托管流水` : '托管流水'}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 leading-relaxed">
              仅展示你作为买家或卖家参与的记录（完整地址）。
            </p>
            <p className="text-[11px] md:text-xs text-muted-foreground mt-2 break-all">
              <span className="text-muted-foreground font-sans">资产地址：</span>
              <span className="font-mono">{asset}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" className="md:h-10 md:px-4 shrink-0 self-start" asChild>
            <Link href={routes.shelf}>返回书架</Link>
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="h-auto px-0 py-1 text-sm md:text-base text-primary" asChild>
          <Link href={bookPublicHistory(asset)}>查看本书公开流转</Link>
        </Button>

        {loading && (
          <div className="flex items-center gap-3 text-base md:text-lg text-muted-foreground py-16 md:py-24 justify-center">
            <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin text-primary" />
            加载中…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 md:px-5 md:py-4 text-sm md:text-base text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <p className="text-base md:text-lg text-muted-foreground py-12 text-center">暂无与你相关的托管事件</p>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="space-y-0 -ml-1 sm:-ml-0">
            {groups.map((group, gi) => (
              <div key={`${group[0]?.escrow_pda}-${gi}`}>
                {gi > 0 ? (
                  <div
                    className="my-10 md:my-14 flex items-center gap-3 text-muted-foreground"
                    role="separator"
                  >
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
                    <span className="text-[11px] sm:text-xs font-medium shrink-0 px-2">新的流转产生</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border" />
                  </div>
                ) : null}

                {group.map((ev) => {
                  const alert = isEscrowActionAlert(ev.action)
                  const rail = alert ? 'border-destructive/45' : 'border-primary/30'
                  const dot = alert ? 'bg-destructive border-destructive' : 'bg-primary border-background'
                  const cardTone = alert
                    ? 'border-destructive/25 bg-destructive/[0.04]'
                    : 'border-border/70 bg-card'
                  return (
                    <div
                      key={ev.id}
                      className="flex gap-2 sm:gap-3 md:gap-5 pb-8 md:pb-11 last:pb-0"
                    >
                      <div className="w-[5.5rem] sm:w-24 md:w-32 shrink-0 text-left sm:text-right pt-1 md:pt-2 pr-0.5">
                        <time
                          className={[
                            'block text-[11px] sm:text-xs md:text-sm lg:text-base font-medium tabular-nums leading-snug',
                            alert ? 'text-destructive' : 'text-muted-foreground',
                          ].join(' ')}
                          dateTime={new Date(ev.created_at * 1000).toISOString()}
                        >
                          {formatTime(ev.created_at)}
                        </time>
                      </div>
                      <div className={['relative flex-1 min-w-0 border-l-2 pl-3 sm:pl-4 md:pl-6', rail].join(' ')}>
                        <span
                          className={[
                            'absolute left-0 top-2 md:top-3 w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 -translate-x-[calc(50%+1px)] rounded-full border-2 shadow-sm',
                            dot,
                          ].join(' ')}
                          aria-hidden
                        />
                        <div
                          className={[
                            'rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 md:px-6 md:py-5 shadow-sm space-y-2 md:space-y-3',
                            cardTone,
                          ].join(' ')}
                        >
                          <p className="text-base md:text-xl font-semibold text-foreground leading-snug">
                            {escrowActionTitle(ev.action)}
                          </p>
                          <div className="text-sm md:text-base text-muted-foreground space-y-1.5 md:space-y-2 leading-relaxed">
                            <p className="break-all">
                              卖家：<span className="font-mono text-foreground/90">{ev.seller}</span>
                            </p>
                            <p className="break-all">
                              买家：<span className="font-mono text-foreground/90">{ev.buyer}</span>
                            </p>
                            <p>
                              状态：{escrowStateZh(ev.from_state)} → {escrowStateZh(ev.to_state)}
                            </p>
                            <p className="text-xs md:text-sm">
                              <span className="text-muted-foreground">托管订单 </span>
                              <span className="font-mono">{shortenPubkey(ev.escrow_pda)}</span>
                              {' · '}
                              <a
                                href={explorerAddressUrl(ev.escrow_pda)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline font-medium"
                              >
                                浏览器中查看完整地址
                              </a>
                            </p>
                            {ev.actor_pubkey ? (
                              <p className="break-all">
                                操作者：<span className="font-mono">{ev.actor_pubkey}</span>
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 pt-1">
                            {ev.tx_signature ? (
                              <a
                                href={explorerTxUrl(ev.tx_signature)}
                                target="_blank"
                                rel="noreferrer"
                                title="在浏览器中打开本条记录对应的链上交易签名与明细"
                                className="text-sm md:text-base text-primary hover:underline font-medium"
                              >
                                查看链上交易
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
