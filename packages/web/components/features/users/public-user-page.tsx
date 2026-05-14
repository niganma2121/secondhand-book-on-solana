'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, MessageCircle, Star } from 'lucide-react'
import {
  fetchPublicUser,
  fetchSellerBooksPage,
  fetchUserReviews,
  type PublicUserProfile,
  type UserReviewsResponse,
} from '@/lib/api/users'
import { ApiError } from '@/lib/api/client'
import { peerDisplayTitle, privacyPubkey } from '@/lib/format-seller'
import { chatWithPeer, marketBookDetail, routes, userPublicProfile } from '@/config/routes'
import type { Book } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function scoreStars(score: number) {
  const n = Math.max(0, Math.min(5, Math.round(score)))
  return (
    <span className="inline-flex gap-0.5 text-amber-400" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={14}
          className={i < n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}
        />
      ))}
    </span>
  )
}

export function PublicUserPage() {
  const params = useParams()
  const router = useRouter()
  const pubkeyRaw = params.pubkey
  const pubkey = typeof pubkeyRaw === 'string' ? pubkeyRaw : Array.isArray(pubkeyRaw) ? pubkeyRaw[0] : ''

  const [profile, setProfile] = useState<PublicUserProfile | null | undefined>(undefined)
  const [reviewsPayload, setReviewsPayload] = useState<UserReviewsResponse | null>(null)
  const [sellerBooks, setSellerBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false)

  useEffect(() => {
    if (!pubkey.trim()) {
      setLoading(false)
      setError('无效的用户地址')
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [u, rev, books] = await Promise.all([
          fetchPublicUser(pubkey),
          fetchUserReviews(pubkey, 1, 30).catch((): UserReviewsResponse => ({
            reviews: [],
            reputation: null,
          })),
          fetchSellerBooksPage(pubkey, 1, 12).catch(() => []),
        ])
        if (!cancelled) {
          setProfile(u)
          setReviewsPayload(rev)
          setSellerBooks(books)
        }
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : '加载失败'
          setError(msg)
          setProfile(undefined)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pubkey])

  const displayName =
    profile === undefined
      ? '…'
      : profile === null
        ? pubkey
          ? peerDisplayTitle(null, pubkey)
          : '用户'
        : peerDisplayTitle(profile.username, profile.pubkey)
  const avatarSrc = profile?.avatar?.trim() || null

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-28 md:pb-10">
      <div className="flex items-center gap-2 mb-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 -ml-2 gap-1 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft size={18} />
          返回
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">加载中…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : profile === null ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <p className="font-semibold text-foreground">暂无站内档案</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            该钱包尚未在本站登录过，后台暂无昵称、信誉与成交汇总。你仍可通过链上地址与对方沟通或筛选其在售书籍。
          </p>
          <button
            type="button"
            className="text-left"
            onClick={() => navigator.clipboard?.writeText(pubkey)}
          >
            <p className="text-xs text-muted-foreground font-mono">{privacyPubkey(pubkey, 3)}</p>
            <p className="text-[10px] text-muted-foreground">点击复制完整地址</p>
          </button>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" size="sm" className="rounded-xl" asChild>
              <Link href={`${routes.market}?seller=${encodeURIComponent(pubkey)}`}>查看其在售（市场筛选）</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" asChild>
              <Link href={chatWithPeer(pubkey)}>
                <MessageCircle className="inline h-4 w-4 mr-1.5" />
                发起聊天
              </Link>
            </Button>
          </div>
        </div>
      ) : profile ? (
        <>
          {/* 头部 */}
          <div className="rounded-2xl bg-card border border-border/60 overflow-hidden mb-5">
            <div className="h-14 bg-gradient-to-br from-primary/15 to-primary/5" />
            <div className="px-4 pb-4 -mt-8 flex gap-3">
              <button
                type="button"
                disabled={!avatarSrc}
                onClick={() => {
                  if (avatarSrc) setAvatarLightboxOpen(true)
                }}
                className={[
                  'relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-card bg-secondary shrink-0',
                  avatarSrc
                    ? 'cursor-zoom-in ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    : 'cursor-default',
                ].join(' ')}
                aria-label={avatarSrc ? '查看头像大图' : '默认头像'}
              >
                {avatarSrc ? (
                  <Image src={avatarSrc} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary/40">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                      <circle cx="14" cy="10" r="5" fill="currentColor" fillOpacity="0.25" />
                      <path
                        d="M4 26c0-5.523 4.477-10 10-10s10 4.477 10 10"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}
              </button>
              <div className="flex-1 min-w-0 pt-9">
                <h1 className="text-lg font-bold text-foreground truncate">{displayName}</h1>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(profile.pubkey)}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground mt-0.5 block text-left"
                  title="点击复制完整地址"
                >
                  {privacyPubkey(profile.pubkey, 3)}
                </button>
              </div>
            </div>

            {/* 信誉 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60 border-t border-border/60">
              <div className="bg-card p-3 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">
                  {Math.round(profile.reputation_score)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">信誉分</p>
              </div>
              <div className="bg-card p-3 text-center">
                <p className="text-lg font-semibold text-foreground tabular-nums">{profile.dispute_total}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">仲裁参与</p>
              </div>
              <div className="bg-card p-3 text-center">
                <p className="text-lg font-semibold text-emerald-500 tabular-nums">{profile.dispute_won}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">仲裁胜</p>
              </div>
              <div className="bg-card p-3 text-center">
                <p className="text-lg font-semibold text-rose-400 tabular-nums">{profile.dispute_lost}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">仲裁负</p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border/50 border-t border-border/50 text-center py-3">
              <div>
                <p className="text-sm font-semibold tabular-nums">{profile.trade_count}</p>
                <p className="text-[10px] text-muted-foreground">成交笔数</p>
              </div>
              <div>
                <p className="text-sm font-semibold tabular-nums">{profile.sell_count}</p>
                <p className="text-[10px] text-muted-foreground">卖出</p>
              </div>
              <div>
                <p className="text-sm font-semibold tabular-nums">{profile.buy_count}</p>
                <p className="text-[10px] text-muted-foreground">买入</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant="outline" size="sm" className="rounded-xl" asChild>
              <Link href={chatWithPeer(profile.pubkey)}>
                <MessageCircle className="inline h-4 w-4 mr-1.5" />
                联系 TA
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" asChild>
              <Link href={`${routes.market}?seller=${encodeURIComponent(profile.pubkey)}`}>
                在售书目（市场）
              </Link>
            </Button>
          </div>

          {/* 评价摘要 */}
          {reviewsPayload?.reputation ? (
            <div className="rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">订单评价</p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-foreground">
                  {reviewsPayload.reputation.avg_score.toFixed(1)} 分
                </span>
                <span className="text-muted-foreground">
                  共 {reviewsPayload.reputation.review_count} 条 · 好评 {reviewsPayload.reputation.good_count}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-5">暂无订单评价记录。</p>
          )}

          {/* 在售节选 */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">在售节选</h2>
            {sellerBooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前没有在售中的书籍。</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {sellerBooks.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={marketBookDetail(b.tokenId)}
                      className="block rounded-xl border border-border/60 bg-card overflow-hidden hover:border-primary/40 transition-colors"
                    >
                      <div className="relative aspect-[3/4] bg-secondary">
                        <Image
                          src={b.cover || '/placeholder.svg'}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">{b.title}</p>
                        <p className="text-[11px] text-primary mt-1 tabular-nums">
                          {typeof b.priceCny === 'number' && b.priceCny > 0 ? (
                            <>¥{b.priceCny.toFixed(2)} · {b.price.toFixed(3)} SOL</>
                          ) : (
                            <>{b.price.toFixed(3)} SOL</>
                          )}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 评价列表 */}
          {reviewsPayload && reviewsPayload.reviews.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-3">评价列表</h2>
              <ul className="space-y-3">
                {reviewsPayload.reviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-border/50 bg-card/80 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link
                        href={userPublicProfile(r.reviewer)}
                        className="text-xs text-muted-foreground font-mono hover:text-primary hover:underline"
                      >
                        {privacyPubkey(r.reviewer, 3)}
                      </Link>
                      <span className="flex items-center gap-1.5">
                        {scoreStars(r.score)}
                        <span className="text-xs text-muted-foreground tabular-nums">{r.score}/5</span>
                      </span>
                    </div>
                    {r.comment?.trim() ? (
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">{r.comment}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">无文字评价</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2 tabular-nums">
                      {new Date(r.created_at * 1000).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <Dialog open={avatarLightboxOpen} onOpenChange={setAvatarLightboxOpen}>
        <DialogContent className="max-w-[min(96vw,560px)] border-border/80 bg-card p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle>{displayName} 的头像</DialogTitle>
            <DialogDescription className="sr-only">放大查看</DialogDescription>
          </DialogHeader>
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt=""
              className="max-h-[min(80vh,720px)] w-auto max-w-full mx-auto rounded-lg object-contain block"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
