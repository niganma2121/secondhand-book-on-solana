'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { EscrowTimelineSegmentSeparator } from '@/components/features/book/escrow-timeline-segment-separator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { routes } from '@/config/routes'
import { fetchBookDetail } from '@/lib/api/book-detail'
import {
  fetchPublicBookHistory,
  type PublicBookEvent,
  type PublicBookHistoryResponse,
  type PublicEscrowEvent,
} from '@/lib/api/book-history'
import { toUserFacingMessage } from '@/lib/api/client'
import { env } from '@/lib/env'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/solana-explorer'
import {
  escrowActionDescription,
  escrowEventPrimaryLine,
  escrowResolveSummary,
  escrowStateZh,
  isEscrowActionAlert,
} from '@/lib/escrow-event-copy'
import { shortenPubkey } from '@/lib/format-seller'

const BOOK_EVENT_LABEL: Record<string, string> = {
  book_created: '书籍创建',
  book_delisted: '下架',
  price_updated: '改价',
  book_relisted: '重新上架',
  escrow_created: '托管订单创建',
  escrow_cancelled: '托管订单取消',
  ownership_transferred: '所有权转移',
}

type MergedRow =
  | { kind: 'book'; created_at: number; id: number; data: PublicBookEvent }
  | { kind: 'escrow'; created_at: number; id: number; data: PublicEscrowEvent }

function mergeRows(res: PublicBookHistoryResponse): MergedRow[] {
  const book = (res.book_events ?? []).map((e) => ({
    kind: 'book' as const,
    created_at: e.created_at,
    id: e.id,
    data: e,
  }))
  const esc = (res.escrow_events ?? []).map((e) => ({
    kind: 'escrow' as const,
    created_at: e.created_at,
    id: e.id,
    data: e,
  }))
  return [...book, ...esc].sort((a, b) => b.created_at - a.created_at || b.id - a.id)
}

/** 同一托管 PDA 归为一笔订单；无 PDA 的单条书目事件单独成组；组间按组内最新时间排序 */
function groupMergedRowsByOrder(rows: MergedRow[]): MergedRow[][] {
  const byPda = new Map<string, MergedRow[]>()
  const singles: MergedRow[] = []

  for (const row of rows) {
    const pda =
      row.kind === 'escrow' ? row.data.escrow_pda : row.data.escrow_pda ?? null
    if (pda && pda.length > 0) {
      const list = byPda.get(pda) ?? []
      list.push(row)
      byPda.set(pda, list)
    } else {
      singles.push(row)
    }
  }

  for (const list of byPda.values()) {
    list.sort((a, b) => b.created_at - a.created_at || b.id - a.id)
  }

  const groups: MergedRow[][] = [...singles.map((r) => [r]), ...Array.from(byPda.values())]
  groups.sort((a, b) => {
    const ta = Math.max(...a.map((r) => r.created_at))
    const tb = Math.max(...b.map((r) => r.created_at))
    return tb - ta || (b[0]?.id ?? 0) - (a[0]?.id ?? 0)
  })
  return groups
}

function mergedGroupPrimaryEscrowPda(group: MergedRow[]): string | null {
  for (const r of group) {
    if (r.kind === 'escrow') return r.data.escrow_pda
    const p = r.data.escrow_pda
    if (typeof p === 'string' && p.length > 0) return p
  }
  return null
}

/** 同一托管 PDA 链上复用：上一单 Released/Cancelled 后再次出现 create_escrow 时拆段（与私有流水一致） */
function splitMergedGroupByEscrowLifecycle(group: MergedRow[]): MergedRow[][] {
  if (group.length <= 1) return [group]
  const asc = [...group].sort((a, b) => a.created_at - b.created_at || a.id - b.id)
  const segments: MergedRow[][] = []
  let cur: MergedRow[] = []
  let lastEscrow: MergedRow | null = null

  const escrowTerminal = (r: MergedRow) =>
    r.kind === 'escrow' &&
    (r.data.to_state === 'Released' || r.data.to_state === 'Cancelled')
  const isEscrowCreate = (r: MergedRow) =>
    r.kind === 'escrow' && r.data.action.trim().toLowerCase() === 'create_escrow'

  for (const row of asc) {
    if (isEscrowCreate(row) && lastEscrow && escrowTerminal(lastEscrow)) {
      if (cur.length) segments.push(cur)
      cur = []
      lastEscrow = null
    }
    cur.push(row)
    if (row.kind === 'escrow') lastEscrow = row
  }
  if (cur.length) segments.push(cur)
  return segments.map((seg) => [...seg].sort((a, b) => b.created_at - a.created_at || b.id - a.id))
}

function groupMergedRowsByOrderWithLifecycle(rows: MergedRow[]): MergedRow[][] {
  const base = groupMergedRowsByOrder(rows)
  const expanded = base.flatMap((g) =>
    g.length <= 1 ? [g] : splitMergedGroupByEscrowLifecycle(g),
  )
  expanded.sort((a, b) => {
    const ta = Math.max(...a.map((r) => r.created_at))
    const tb = Math.max(...b.map((r) => r.created_at))
    return tb - ta || (b[0]?.id ?? 0) - (a[0]?.id ?? 0)
  })
  return expanded
}

function isMergedRowTimelineAlert(row: MergedRow): boolean {
  if (row.kind === 'escrow') return isEscrowActionAlert(row.data.action)
  return row.data.event_type === 'escrow_cancelled'
}

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

function payloadImageUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const o = payload as Record<string, unknown>
  const urls: string[] = []
  const singleKeys = ['cover_url', 'image', 'image_url', 'cover', 'uri']
  for (const k of singleKeys) {
    const v = o[k]
    if (typeof v === 'string' && v.startsWith('http')) urls.push(v)
  }
  for (const k of ['detail_urls', 'images', 'image_urls']) {
    const v = o[k]
    if (!Array.isArray(v)) continue
    for (const item of v) {
      if (typeof item === 'string' && item.startsWith('http')) urls.push(item)
      else if (item && typeof item === 'object' && 'url' in item) {
        const u = (item as { url?: unknown }).url
        if (typeof u === 'string' && u.startsWith('http')) urls.push(u)
      }
    }
  }
  return [...new Set(urls)]
}

function payloadTitleAndDescription(payload: unknown): { title?: string; description?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const o = payload as Record<string, unknown>
  const pickStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  return {
    title: pickStr(o.name) ?? pickStr(o.title) ?? pickStr(o.book_name),
    description: pickStr(o.description) ?? pickStr(o.desc) ?? pickStr(o.summary),
  }
}

function escrowSnapshotBasics(snapshot: unknown): {
  category?: string
  condition?: string
  metadataUrl?: string
  capturedAt?: number
} {
  if (!snapshot || typeof snapshot !== 'object') return {}
  const o = snapshot as Record<string, unknown>
  return {
    category: typeof o.category === 'string' ? o.category : undefined,
    condition: typeof o.condition === 'string' ? o.condition : undefined,
    metadataUrl: typeof o.metadata_url === 'string' ? o.metadata_url : undefined,
    capturedAt: typeof o.captured_at === 'number' ? o.captured_at : undefined,
  }
}

function escrowDisputeNote(data: PublicEscrowEvent): string | null {
  const a = data.action?.toLowerCase() ?? ''
  const from = (data.from_state ?? '').toLowerCase()
  const to = (data.to_state ?? '').toLowerCase()
  if (a.includes('dispute') || to.includes('disputed') || from.includes('disputed')) {
    if (a === 'open_dispute') return '本步已发起争议，托管进入待裁状态。'
    if (a === 'resolve_dispute') {
      return escrowResolveSummary(data.payload) ?? '本步为争议裁决相关链上动作。'
    }
    if (to.includes('disputed')) return '本条记录后托管处于争议/仲裁流程中（以链上状态为准）。'
  }
  return null
}

function RecordDetailDialog({
  open,
  onOpenChange,
  row,
  asset,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  row: MergedRow | null
  asset: string
}) {
  if (!row) return null

  const title =
    row.kind === 'book'
      ? BOOK_EVENT_LABEL[row.data.event_type] ?? row.data.event_type
      : escrowEventPrimaryLine(row.data.action, row.data.payload)

  const payload = row.kind === 'book' ? row.data.payload : null
  const escrowSnap = row.kind === 'escrow' ? row.data.book_snapshot : null
  const imgs = row.kind === 'book' ? payloadImageUrls(payload) : []
  const escrowSnapImgs = row.kind === 'escrow' ? payloadImageUrls(escrowSnap) : []
  const { title: snapTitle, description: snapDesc } = payloadTitleAndDescription(payload)
  const {
    title: escSnapTitle,
    description: escSnapDesc,
  } = payloadTitleAndDescription(escrowSnap)
  const escSnapBasics = escrowSnapshotBasics(escrowSnap)
  const hasPayloadObject =
    row.kind === 'book' &&
    payload != null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    Object.keys(payload as object).length > 0

  const escrowSummary =
    row.kind === 'escrow'
      ? escrowActionDescription(row.data.action, row.data.payload)
      : null
  const disputeNote = row.kind === 'escrow' ? escrowDisputeNote(row.data) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,520px)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>记录详情</DialogTitle>
          <DialogDescription className="text-xs font-mono break-all">
            本条发生时间 {formatTime(row.created_at)} · {asset}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-foreground">{title}</p>

          {row.kind === 'escrow' && escrowSummary && (
            <p className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-xs sm:text-sm text-foreground/90 leading-relaxed">
              {escrowSummary}
            </p>
          )}
          {row.kind === 'escrow' && disputeNote && (
            <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs sm:text-sm text-foreground/90 leading-relaxed">
              {disputeNote}
            </p>
          )}

          {row.kind === 'book' && (snapTitle || snapDesc) && (
            <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs sm:text-sm">
              {snapTitle && <p className="font-medium text-foreground">{snapTitle}</p>}
              {snapDesc && <p className="text-muted-foreground whitespace-pre-wrap break-words">{snapDesc}</p>}
            </div>
          )}

          {row.kind === 'book' && (
            <div className="text-muted-foreground space-y-1.5 text-xs sm:text-sm">
              {row.data.from_owner && (
                <p>
                  转出：<span className="font-mono text-foreground/90">{row.data.from_owner}</span>
                </p>
              )}
              {row.data.to_owner && (
                <p>
                  转入：<span className="font-mono text-foreground/90">{row.data.to_owner}</span>
                </p>
              )}
              {row.data.escrow_pda && <p className="font-mono break-all">托管 PDA：{row.data.escrow_pda}</p>}
              {row.data.actor_pubkey && (
                <p>
                  操作者：<span className="font-mono">{row.data.actor_pubkey}</span>
                </p>
              )}
            </div>
          )}

          {row.kind === 'escrow' && (
            <div className="text-muted-foreground space-y-1.5 text-xs sm:text-sm">
              <p>
                卖家 <span className="font-mono text-foreground/90">{row.data.seller}</span>
                {' → '}
                买家 <span className="font-mono text-foreground/90">{row.data.buyer}</span>
              </p>
              <p>
                状态：{escrowStateZh(row.data.from_state)} → {escrowStateZh(row.data.to_state)}
              </p>
              <p className="font-mono break-all">托管 PDA：{row.data.escrow_pda}</p>
              {row.data.actor_pubkey && (
                <p>
                  操作者：<span className="font-mono">{row.data.actor_pubkey}</span>
                </p>
              )}
            </div>
          )}

          {row.kind === 'escrow' && escrowSnap != null && typeof escrowSnap === 'object' && (
            <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2.5 text-xs sm:text-sm">
              <p className="font-medium text-foreground">本单创建时的书目快照</p>
              {typeof escSnapBasics.capturedAt === 'number' && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  快照时间 {formatTime(escSnapBasics.capturedAt)}
                </p>
              )}
              {(escSnapTitle || escSnapDesc) && (
                <div className="space-y-1">
                  {escSnapTitle && <p className="font-semibold text-foreground">{escSnapTitle}</p>}
                  {escSnapDesc && (
                    <p className="text-muted-foreground whitespace-pre-wrap break-words">{escSnapDesc}</p>
                  )}
                </div>
              )}
              {(escSnapBasics.category || escSnapBasics.condition) && (
                <p className="text-muted-foreground">
                  {[escSnapBasics.category, escSnapBasics.condition].filter(Boolean).join(' · ')}
                </p>
              )}
              {escSnapBasics.metadataUrl && (
                <a
                  href={escSnapBasics.metadataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-primary hover:underline font-medium break-all"
                >
                  元数据 JSON
                </a>
              )}
            </div>
          )}

          {imgs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {imgs.map((src) => (
                <div
                  key={src}
                  className="w-[calc(50%-0.25rem)] max-w-[200px] overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-[3/4] w-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {hasPayloadObject && (
            <details className="rounded-lg border border-border/60 bg-secondary/30 px-2 py-1.5 text-xs">
              <summary className="cursor-pointer select-none text-foreground">事件附带数据</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
          )}

          {escrowSnapImgs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {escrowSnapImgs.map((src) => (
                <div
                  key={`esc-${src}`}
                  className="w-[calc(50%-0.25rem)] max-w-[200px] overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-[3/4] w-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {row.kind === 'book' && !hasPayloadObject && imgs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              本条在库中未附带书目/图片快照；角色与托管信息见上文，或打开链上交易核对。
            </p>
          )}

          {row.kind === 'escrow' && !row.data.book_snapshot && (
            <p className="text-xs text-muted-foreground">
              本单尚无冻结书目快照（多为功能上线前的订单）；可与当前书目或链上记录对照。
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            {row.kind === 'book' && row.data.tx_signature && (
              <a
                href={explorerTxUrl(row.data.tx_signature)}
                target="_blank"
                rel="noreferrer"
                title="在浏览器中打开本条记录对应的链上交易签名与明细"
                className="text-sm text-primary hover:underline font-medium"
              >
                查看链上交易
              </a>
            )}
            {row.kind === 'escrow' && row.data.tx_signature && (
              <a
                href={explorerTxUrl(row.data.tx_signature)}
                target="_blank"
                rel="noreferrer"
                title="在浏览器中打开本条记录对应的链上交易签名与明细"
                className="text-sm text-primary hover:underline font-medium"
              >
                查看链上交易
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function BookPublicHistoryPage({ asset }: { asset: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PublicBookHistoryResponse | null>(null)
  const [bookName, setBookName] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<MergedRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

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
      const [hist, detail] = await Promise.all([
        fetchPublicBookHistory(asset, 1, 100),
        fetchBookDetail(asset).catch(() => null),
      ])
      setData(hist)
      setBookName(detail?.book?.name?.trim() ? detail.book.name.trim() : null)
    } catch (e) {
      setData(null)
      setBookName(null)
      setError(toUserFacingMessage(e, '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [asset])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => (data ? mergeRows(data) : []), [data])
  const groups = useMemo(() => groupMergedRowsByOrderWithLifecycle(rows), [rows])

  return (
    <div className="pb-28 md:pb-12">
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-5 lg:px-8 pt-6 md:pt-10 space-y-5 md:space-y-7">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              本书流转
            </h1>
            <div className="mt-2 md:mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {bookName ? (
                <span className="text-lg md:text-2xl lg:text-3xl font-bold text-primary leading-snug">
                  《{bookName}》
                </span>
              ) : (
                !loading && (
                  <span className="text-sm md:text-base text-muted-foreground">（未能加载书名）</span>
                )
              )}
              <span className="text-xs md:text-sm lg:text-base text-muted-foreground font-mono break-all leading-relaxed">
                {asset}
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="md:h-10 md:px-4 md:text-sm shrink-0 self-start" asChild>
            <Link href={routes.market}>返回市场</Link>
          </Button>
        </div>

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

        {!loading && !error && rows.length === 0 && (
          <p className="text-base md:text-lg text-muted-foreground py-12 text-center">暂无记录</p>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="space-y-0 -ml-1 sm:-ml-0">
            {groups.map((group, gi) => {
              const pdaCur = mergedGroupPrimaryEscrowPda(group)
              return (
                <div key={`${pdaCur ?? 'na'}-${group[0]?.kind}-${group[0]?.id}-g${gi}`}>
                  {gi > 0 ? <EscrowTimelineSegmentSeparator /> : null}

                  {group.map((row) => {
                    const alert = isMergedRowTimelineAlert(row)
                    const rail = alert ? 'border-destructive/45' : 'border-primary/30'
                    const dot = alert ? 'bg-destructive border-destructive' : 'bg-primary border-background'
                    const cardTone = alert
                      ? 'border-destructive/25 bg-destructive/[0.04]'
                      : 'border-border/70 bg-card'
                    return (
                      <div
                        key={`${row.kind}-${row.id}`}
                        className="flex gap-2 sm:gap-3 md:gap-5 pb-8 md:pb-11 last:pb-0"
                      >
                        <div className="w-[5.5rem] sm:w-24 md:w-32 shrink-0 text-left sm:text-right pt-1 md:pt-2 pr-0.5">
                          <time
                            className={[
                              'block text-[11px] sm:text-xs md:text-sm lg:text-base font-medium tabular-nums leading-snug',
                              alert ? 'text-destructive' : 'text-muted-foreground',
                            ].join(' ')}
                            dateTime={new Date(row.created_at * 1000).toISOString()}
                          >
                            {formatTime(row.created_at)}
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
                              {row.kind === 'book'
                                ? BOOK_EVENT_LABEL[row.data.event_type] ?? row.data.event_type
                                : escrowEventPrimaryLine(row.data.action, row.data.payload)}
                            </p>
                            {row.kind === 'book' && (
                              <div className="text-sm md:text-base text-muted-foreground space-y-1.5 md:space-y-2 leading-relaxed">
                                {row.data.from_owner && (
                                  <p>
                                    转出：<span className="font-mono text-foreground/90">{row.data.from_owner}</span>
                                  </p>
                                )}
                                {row.data.to_owner && (
                                  <p>
                                    转入：<span className="font-mono text-foreground/90">{row.data.to_owner}</span>
                                  </p>
                                )}
                                {row.data.escrow_pda && (
                                  <p className="text-xs md:text-sm">
                                    <span className="text-muted-foreground">托管订单 </span>
                                    <span className="font-mono">{shortenPubkey(row.data.escrow_pda)}</span>
                                    {' · '}
                                    <a
                                      href={explorerAddressUrl(row.data.escrow_pda)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline font-medium"
                                    >
                                      浏览器中查看
                                    </a>
                                  </p>
                                )}
                                {row.data.actor_pubkey && (
                                  <p>
                                    操作者：<span className="font-mono">{row.data.actor_pubkey}</span>
                                  </p>
                                )}
                              </div>
                            )}
                            {row.kind === 'escrow' && (
                              <div className="text-sm md:text-base text-muted-foreground space-y-1.5 md:space-y-2 leading-relaxed">
                                <p>
                                  卖家 <span className="font-mono text-foreground/90">{row.data.seller}</span>
                                  {' → '}
                                  买家 <span className="font-mono text-foreground/90">{row.data.buyer}</span>
                                </p>
                                <p>
                                  状态：
                                  <span className="text-foreground/90">{escrowStateZh(row.data.from_state)}</span>
                                  {' → '}
                                  <span className="text-foreground/90">{escrowStateZh(row.data.to_state)}</span>
                                </p>
                                <p className="text-xs md:text-sm">
                                  <span className="text-muted-foreground">托管订单 </span>
                                  <span className="font-mono">{shortenPubkey(row.data.escrow_pda)}</span>
                                  {' · '}
                                  <a
                                    href={explorerAddressUrl(row.data.escrow_pda)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline font-medium"
                                  >
                                    浏览器中查看
                                  </a>
                                </p>
                                {row.data.actor_pubkey && (
                                  <p>
                                    操作者：<span className="font-mono">{row.data.actor_pubkey}</span>
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 pt-1">
                              <button
                                type="button"
                                className="text-sm md:text-base text-primary hover:underline font-medium text-left"
                                onClick={() => {
                                  setDetailRow(row)
                                  setDetailOpen(true)
                                }}
                              >
                                查看详情
                              </button>
                              {row.kind === 'book' && row.data.tx_signature && (
                                <a
                                  href={explorerTxUrl(row.data.tx_signature)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="在浏览器中打开本条记录对应的链上交易签名与明细"
                                  className="text-sm md:text-base text-primary hover:underline font-medium"
                                >
                                  查看链上交易
                                </a>
                              )}
                              {row.kind === 'escrow' && row.data.tx_signature && (
                                <a
                                  href={explorerTxUrl(row.data.tx_signature)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="在浏览器中打开本条记录对应的链上交易签名与明细"
                                  className="text-sm md:text-base text-primary hover:underline font-medium"
                                >
                                  查看链上交易
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        <RecordDetailDialog
          open={detailOpen}
          onOpenChange={(v) => {
            setDetailOpen(v)
            if (!v) setDetailRow(null)
          }}
          row={detailRow}
          asset={asset}
        />
      </div>
    </div>
  )
}
