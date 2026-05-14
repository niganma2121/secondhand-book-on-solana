'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ZoomIn } from 'lucide-react'
import type { ArbitrationBriefing } from '@/lib/api/arbitration'
import type { DisputeSubmissionResponse, DisputeSubmissionRevision } from '@/lib/api/dispute-submission'
import { briefMessageParts } from '@/lib/arbitration-briefing-messages'
import { splitDisputePrivateText } from '@/lib/dispute-private-text'
import { bookPublicHistory } from '@/config/routes'
import { escrowActionDescription, escrowActionTitle, escrowStateZh } from '@/lib/escrow-event-copy'
import { shortenPubkey } from '@/lib/format-seller'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/solana-explorer'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageLightboxDialog } from '@/components/shared/image-lightbox-dialog'

function parseAttachmentUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/** 尚无 revisions 表数据时，用当前 submission 顶一条展示，避免工作台空白 */
function submissionAsSingleRevision(row: DisputeSubmissionResponse): DisputeSubmissionRevision {
  return {
    id: -Math.abs(row.created_at),
    revision_index: 1,
    initiator: row.initiator,
    public_text: row.public_text,
    public_attachment_urls: row.public_attachment_urls,
    private_text: row.private_text,
    created_at: row.created_at,
  }
}

function lamportsToSolLabel(lamports: number): string {
  const L = 1_000_000_000
  const n = lamports / L
  if (!Number.isFinite(n)) return '—'
  const s = n.toFixed(n >= 100 ? 0 : n >= 1 ? 2 : 4)
  return `${s} SOL`
}

function EvidenceImageTile({
  url,
  onPick,
  comfortable,
}: {
  url: string
  onPick: (u: string) => void
  comfortable: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(url)}
      className="group relative block w-full overflow-hidden rounded-lg border border-border bg-muted/30 text-left outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="点击放大查看凭证图"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className={cn(
          'w-full object-contain bg-muted/50 transition-transform group-hover:scale-[1.01]',
          comfortable ? 'max-h-72 sm:max-h-96' : 'max-h-64',
        )}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span
        className={cn(
          'pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          comfortable ? 'px-2.5 py-1.5 text-sm' : 'px-2 py-1 text-xs',
        )}
      >
        <ZoomIn className={comfortable ? 'size-4 shrink-0' : 'size-3.5 shrink-0'} aria-hidden />
        放大
      </span>
    </button>
  )
}

function PrivateArbitratorBlocks({
  text,
  comfortable,
}: {
  text: string | null | undefined
  comfortable: boolean
}) {
  const { supplementary, trackingNumber } = splitDisputePrivateText(text)
  if (!supplementary && !trackingNumber) return null
  const lh = comfortable ? 'text-sm mb-1.5' : 'text-[11px] mb-1'
  const box = comfortable ? 'px-3 py-2.5 text-base' : 'px-2.5 py-2 text-sm'
  return (
    <div className="space-y-2.5 pt-1 border-t border-border/40">
      {supplementary ? (
        <div>
          <p className={cn('font-medium text-amber-950 dark:text-amber-100', lh)}>仅仲裁员可见 · 补充说明</p>
          <div
            className={cn(
              'rounded-md border border-amber-500/35 bg-amber-500/10 whitespace-pre-wrap break-words text-foreground',
              box,
            )}
          >
            {supplementary}
          </div>
        </div>
      ) : null}
      {trackingNumber ? (
        <div>
          <p className={cn('font-medium text-amber-950 dark:text-amber-100', lh)}>仅仲裁员可见 · 物流单号</p>
          <div
            className={cn(
              'rounded-md border border-amber-500/35 bg-amber-500/10 font-mono break-all text-foreground',
              box,
            )}
          >
            {trackingNumber}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SideRevisionList({
  revisions,
  onPickImage,
  comfortable,
  /** 已在外层有栏目标题时，不再重复「历次提交」与顶部分割线 */
  embedded = false,
}: {
  revisions: DisputeSubmissionRevision[]
  onPickImage: (u: string) => void
  comfortable: boolean
  embedded?: boolean
}) {
  if (revisions.length === 0) return null
  const lbl = comfortable ? 'text-sm font-medium text-muted-foreground mb-1.5' : 'text-[11px] font-medium text-muted-foreground mb-1'
  const bodyBox = comfortable
    ? 'rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 text-base whitespace-pre-wrap break-words'
    : 'rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-sm whitespace-pre-wrap break-words'
  const head = comfortable ? 'text-sm text-muted-foreground' : 'text-[11px] text-muted-foreground'
  return (
    <div className={cn('space-y-3', !embedded && 'border-t border-border/45 pt-3 mt-1')}>
      {!embedded ? (
        <p className={cn(head, 'font-medium text-foreground/90')}>历次提交（按保存顺序）</p>
      ) : null}
      {revisions.map((rev) => {
        const urls = parseAttachmentUrls(rev.public_attachment_urls)
        const privRaw = rev.private_text != null ? String(rev.private_text) : ''
        const { supplementary: privNotes, trackingNumber: privTracking } = splitDisputePrivateText(privRaw)
        const showPriv = privNotes.length > 0 || (privTracking != null && privTracking.length > 0)
        return (
          <div
            key={rev.id}
            className={cn(
              'rounded-lg border border-border/60 bg-background/60 p-3 space-y-2',
              comfortable && 'p-3.5',
            )}
          >
            <p className={cn('tabular-nums', head)}>
              第 <span className="font-semibold text-foreground">{rev.revision_index}</span> 次提交 ·{' '}
              {new Date(rev.created_at * 1000).toLocaleString('zh-CN')}
            </p>
            <div>
              <p className={lbl}>公开说明</p>
              <div className={bodyBox}>{rev.public_text}</div>
            </div>
            {urls.length > 0 ? (
              <div>
                <p className={cn(lbl, comfortable && 'mb-2')}>公开凭证图</p>
                <div className="grid grid-cols-1 gap-2">
                  {urls.map((u) => (
                    <EvidenceImageTile key={`${rev.id}-${u}`} url={u} onPick={onPickImage} comfortable={comfortable} />
                  ))}
                </div>
              </div>
            ) : null}
            {showPriv ? <PrivateArbitratorBlocks text={privRaw} comfortable={comfortable} /> : null}
          </div>
        )
      })}
    </div>
  )
}

/** 仲裁工作台：单侧仅展示历史修订，不再重复「当前快照」大块 */
function ArbitratorSideHistoryColumn({
  sideTitle,
  revisions,
  onPickImage,
  comfortable,
}: {
  sideTitle: string
  revisions: DisputeSubmissionRevision[]
  onPickImage: (u: string) => void
  comfortable: boolean
}) {
  const emptyCls = comfortable
    ? 'rounded-xl border border-dashed border-border/80 bg-muted/10 p-6 min-h-[140px] flex items-center justify-center text-center text-base text-muted-foreground'
    : 'rounded-xl border border-dashed border-border/80 bg-muted/10 p-4 min-h-[120px] flex items-center justify-center text-center text-sm text-muted-foreground'
  const titleCls = comfortable ? 'text-lg sm:text-xl font-semibold' : 'text-sm font-semibold'
  if (revisions.length === 0) {
    return <div className={emptyCls}>{sideTitle}：暂无历史提交</div>
  }
  return (
    <section className="rounded-xl border border-border/80 bg-background/80 p-4 sm:p-5 space-y-3 shadow-sm h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3 shrink-0">
        <span className={cn('text-foreground', titleCls)}>{sideTitle}</span>
        <span className={cn('text-muted-foreground', comfortable ? 'text-sm' : 'text-xs')}>按保存时间排序</span>
      </div>
      <SideRevisionList revisions={revisions} onPickImage={onPickImage} comfortable={comfortable} embedded />
    </section>
  )
}

function ExtraSubmissionCard({
  s,
  onPickImage,
  comfortable,
}: {
  s: DisputeSubmissionResponse
  onPickImage: (u: string) => void
  comfortable: boolean
}) {
  const urls = parseAttachmentUrls(s.public_attachment_urls)
  const lbl = comfortable ? 'text-sm font-medium text-muted-foreground mb-1.5' : 'text-[11px] font-medium text-muted-foreground mb-1'
  const bodyBox = comfortable
    ? 'rounded-md border border-border/60 bg-background/80 px-3 py-2.5 text-base whitespace-pre-wrap break-words'
    : 'rounded-md border border-border/60 bg-background/80 px-2.5 py-2 text-sm whitespace-pre-wrap break-words'

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
      <p className={comfortable ? 'text-base font-medium text-amber-950 dark:text-amber-50' : 'text-xs font-medium text-amber-950 dark:text-amber-50'}>
        非本单买/卖公钥的提交 · <span className="font-mono">{shortenPubkey(s.initiator)}</span>
      </p>
      <div>
        <p className={lbl}>公开说明</p>
        <div className={bodyBox}>{s.public_text}</div>
      </div>
      {urls.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {urls.map((u) => (
            <EvidenceImageTile key={u} url={u} onPick={onPickImage} comfortable={comfortable} />
          ))}
        </div>
      ) : null}
      <PrivateArbitratorBlocks text={s.private_text} comfortable={comfortable} />
    </section>
  )
}

export function ArbitrationBriefingView({
  data,
  layout = 'default',
}: {
  data: ArbitrationBriefing
  layout?: 'default' | 'page'
}) {
  const comfortable = layout === 'page'
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const onPickImage = useCallback((u: string) => setPreviewUrl(u), [])

  const { escrow, submissions, events, messages, revisions: revisionsRaw = [] } = data
  const buyer = escrow.buyer.trim()
  const seller = escrow.seller.trim()
  const buyerRow = submissions.find((x) => x.initiator.trim() === buyer) ?? null
  const sellerRow = submissions.find((x) => x.initiator.trim() === seller) ?? null
  const extras = submissions.filter((x) => {
    const i = x.initiator.trim()
    return i !== buyer && i !== seller
  })
  const buyerRevs = useMemo(
    () => revisionsRaw.filter((r) => r.initiator.trim() === buyer),
    [revisionsRaw, buyer],
  )
  const sellerRevs = useMemo(
    () => revisionsRaw.filter((r) => r.initiator.trim() === seller),
    [revisionsRaw, seller],
  )
  const buyerRevsDisplay = useMemo(() => {
    if (buyerRevs.length > 0) return buyerRevs
    if (buyerRow) return [submissionAsSingleRevision(buyerRow)]
    return []
  }, [buyerRevs, buyerRow])
  const sellerRevsDisplay = useMemo(() => {
    if (sellerRevs.length > 0) return sellerRevs
    if (sellerRow) return [submissionAsSingleRevision(sellerRow)]
    return []
  }, [sellerRevs, sellerRow])
  const materialsTabCount = revisionsRaw.length > 0 ? revisionsRaw.length : submissions.length
  const hasAnyMaterials = revisionsRaw.length > 0 || submissions.length > 0

  const visibleChat = useMemo(
    () => messages.filter((m) => briefMessageParts(m.content).kind !== 'skip'),
    [messages],
  )

  const tabPad = comfortable ? 'p-4 sm:p-6' : 'p-3'
  const tabListCls = comfortable ? 'h-auto min-h-11 flex-wrap gap-1 py-1.5 px-1' : 'h-auto flex-wrap py-1'
  const tabTrig = comfortable ? 'text-sm sm:text-base px-4 py-2 data-[state=active]:text-base' : 'text-xs'

  return (
    <div
      className={cn(
        'min-h-0 flex-1 flex flex-col',
        comfortable ? 'space-y-5 text-base sm:text-[17px] leading-relaxed' : 'space-y-3',
      )}
    >
      <Tabs defaultValue="materials" className="min-h-0 flex-1 flex flex-col gap-3">
        <TabsList className={cn('w-full sm:w-fit shrink-0', tabListCls)}>
          <TabsTrigger value="materials" className={tabTrig}>
            争议材料（{materialsTabCount}）
          </TabsTrigger>
          <TabsTrigger value="chain" className={tabTrig}>
            链上流水（{events.length}）
          </TabsTrigger>
          <TabsTrigger value="chat" className={tabTrig}>
            站内私信（{visibleChat.length}）
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="materials"
          className={cn(
            'mt-0 min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60 bg-card/40 space-y-4 data-[state=inactive]:hidden',
            tabPad,
          )}
        >
          {hasAnyMaterials ? (
            <>
              <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
                <ArbitratorSideHistoryColumn
                  sideTitle="买方历史提交"
                  revisions={buyerRevsDisplay}
                  onPickImage={onPickImage}
                  comfortable={comfortable}
                />
                <ArbitratorSideHistoryColumn
                  sideTitle="卖方历史提交"
                  revisions={sellerRevsDisplay}
                  onPickImage={onPickImage}
                  comfortable={comfortable}
                />
              </div>
              {extras.length > 0 ? (
                <div className="space-y-4">
                  <p className={comfortable ? 'text-base text-muted-foreground' : 'text-xs text-muted-foreground'}>
                    下列提交方与当前托管买/卖公钥不一致（数据异常时可能出现）：
                  </p>
                  {extras.map((s) => {
                    const extraRevs = revisionsRaw.filter((r) => r.initiator.trim() === s.initiator.trim())
                    if (extraRevs.length > 0) {
                      return (
                        <section
                          key={s.initiator}
                          className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
                        >
                          <p
                            className={
                              comfortable
                                ? 'text-base font-medium text-amber-950 dark:text-amber-50'
                                : 'text-xs font-medium text-amber-950 dark:text-amber-50'
                            }
                          >
                            非本单买/卖公钥的提交 · <span className="font-mono">{shortenPubkey(s.initiator)}</span>
                          </p>
                          <SideRevisionList
                            revisions={extraRevs}
                            onPickImage={onPickImage}
                            comfortable={comfortable}
                            embedded
                          />
                        </section>
                      )
                    }
                    return (
                      <ExtraSubmissionCard key={s.initiator} s={s} onPickImage={onPickImage} comfortable={comfortable} />
                    )
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <p className={cn('text-muted-foreground py-8 text-center', comfortable ? 'text-lg' : 'text-sm')}>
              暂无链下争议材料。
            </p>
          )}
        </TabsContent>

        <TabsContent
          value="chain"
          className={cn(
            'mt-0 min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60 bg-card/40 space-y-3 data-[state=inactive]:hidden',
            tabPad,
          )}
        >
          {events.length === 0 ? (
            <p className={cn('text-muted-foreground py-8 text-center', comfortable ? 'text-lg' : 'text-sm')}>
              暂无链上流水记录。
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className={cn(
                    'rounded-lg border border-border/60 bg-background/70 px-3 py-3 space-y-1.5',
                    comfortable && 'px-4 py-4 text-base sm:text-[17px]',
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-foreground">{escrowActionTitle(ev.action)}</span>
                    <time className={cn('text-muted-foreground tabular-nums', comfortable ? 'text-sm' : 'text-[11px]')}>
                      {new Date(ev.created_at * 1000).toLocaleString('zh-CN')}
                    </time>
                  </div>
                  <p className={cn('text-muted-foreground leading-snug', comfortable ? 'text-base' : 'text-xs')}>
                    {escrowActionDescription(ev.action)}
                  </p>
                  <p className={cn('text-muted-foreground', comfortable ? 'text-sm sm:text-base' : 'text-[11px]')}>
                    状态 {escrowStateZh(ev.from_state)} → <span className="text-foreground">{escrowStateZh(ev.to_state)}</span>
                    {ev.actor_pubkey ? (
                      <>
                        {' '}
                        · 操作方 <span className="font-mono text-foreground/90">{shortenPubkey(ev.actor_pubkey)}</span>
                      </>
                    ) : null}
                  </p>
                  {ev.tx_signature ? (
                    <a
                      className={cn(
                        'text-primary hover:underline inline-block font-mono break-all',
                        comfortable ? 'text-sm' : 'text-[11px]',
                      )}
                      href={explorerTxUrl(ev.tx_signature)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      交易 {shortenPubkey(ev.tx_signature)}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent
          value="chat"
          className={cn(
            'mt-0 min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60 bg-muted/20 data-[state=inactive]:hidden',
            tabPad,
          )}
        >
          {messages.length === 0 ? (
            <p className={cn('text-muted-foreground py-8 text-center', comfortable ? 'text-lg' : 'text-sm')}>
              双方暂无站内私信记录。
            </p>
          ) : visibleChat.length === 0 ? (
            <p className={cn('text-muted-foreground py-8 text-center', comfortable ? 'text-lg' : 'text-sm')}>
              仅有已读回执等系统消息，已折叠隐藏。
            </p>
          ) : (
            <div className="w-full max-w-full space-y-4 min-w-0">
              {visibleChat.map((m) => {
                const fp = m.from_pubkey.trim()
                const fromBuyer = fp === buyer
                const fromSeller = fp === seller
                const sideLabel = fromBuyer ? '买方' : fromSeller ? '卖方' : shortenPubkey(fp)
                const parts = briefMessageParts(m.content)
                const bubble = comfortable ? 'px-4 py-3 text-base max-w-[min(100%,26rem)]' : 'px-3 py-2 text-sm max-w-[min(100%,22rem)]'
                const alignLeft = fromBuyer || (!fromBuyer && !fromSeller)
                return (
                  <div key={m.id} className="flex w-full min-w-0">
                    <div
                      className={cn(
                        'rounded-2xl border shadow-sm shrink-0 min-w-0',
                        bubble,
                        alignLeft
                          ? 'mr-auto border-primary/25 bg-primary/5 rounded-tl-sm'
                          : 'ml-auto border-border bg-card rounded-tr-sm',
                      )}
                    >
                      <div
                        className={cn(
                          'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground mb-1',
                          comfortable ? 'text-xs sm:text-sm' : 'text-[10px]',
                        )}
                      >
                        <span className="font-semibold text-foreground">{sideLabel}</span>
                        <span className="font-mono">{shortenPubkey(fp)}</span>
                        <span className="tabular-nums">{new Date(m.timestamp * 1000).toLocaleString('zh-CN')}</span>
                      </div>
                      {parts.kind === 'text' ? (
                        <p className="whitespace-pre-wrap break-words text-foreground leading-relaxed">{parts.text}</p>
                      ) : parts.kind === 'image' ? (
                        <div className="space-y-2">
                          {parts.caption ? (
                            <p className="text-muted-foreground whitespace-pre-wrap text-sm sm:text-base">{parts.caption}</p>
                          ) : null}
                          <div className="space-y-1">
                            <EvidenceImageTile url={parts.url} onPick={onPickImage} comfortable={comfortable} />
                            <a
                              href={parts.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-xs sm:text-sm text-primary hover:underline"
                            >
                              新窗口打开原图
                            </a>
                          </div>
                        </div>
                      ) : parts.kind === 'other' ? (
                        <p className="text-muted-foreground text-sm">{parts.label}</p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div
        className={cn(
          'shrink-0 rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-muted-foreground space-y-1.5',
          comfortable ? 'text-base sm:text-lg px-4 py-4' : 'text-[11px]',
        )}
      >
        <p>
          <span className="font-semibold text-foreground">托管摘要：</span>
          状态 {escrowStateZh(escrow.state)} · 金额 {lamportsToSolLabel(escrow.price)} · 资产{' '}
          <Link href={bookPublicHistory(escrow.asset)} className="text-primary hover:underline font-mono">
            {shortenPubkey(escrow.asset)}
          </Link>
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            买方{' '}
            <a className="font-mono text-primary hover:underline" href={explorerAddressUrl(buyer)} target="_blank" rel="noreferrer">
              {shortenPubkey(buyer)}
            </a>
          </span>
          <span>
            卖方{' '}
            <a className="font-mono text-primary hover:underline" href={explorerAddressUrl(seller)} target="_blank" rel="noreferrer">
              {shortenPubkey(seller)}
            </a>
          </span>
        </p>
      </div>

      <ImageLightboxDialog
        open={previewUrl != null}
        url={previewUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null)
        }}
        title="凭证图预览"
      />
    </div>
  )
}
