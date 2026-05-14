'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { arbitrationBriefing, routes, bookPublicHistory } from '@/config/routes'
import { isArbitratorPubkey } from '@/lib/arbitration-access'
import { fetchArbitrationDisputes, type ArbitrationDisputeOrder } from '@/lib/api/arbitration'
import { ApiError } from '@/lib/api/client'
import {
  buildResolveDispute,
  broadcastResolveDispute,
  signEscrowTxWithWallet,
} from '@/lib/api/escrow'
import { env } from '@/lib/env'
import { shortenPubkey } from '@/lib/format-seller'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/solana-explorer'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { cn } from '@/lib/utils'

function disputeSubmittersFromOrder(o: ArbitrationDisputeOrder): string[] {
  const raw = o.dispute_submitters
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))]
}

function disputeMaterialFlags(o: ArbitrationDisputeOrder) {
  const subs = disputeSubmittersFromOrder(o)
  const b = (o.buyer ?? '').trim()
  const s = (o.seller ?? '').trim()
  return {
    buyerSubmitted: b.length > 0 && subs.some((p) => p === b),
    sellerSubmitted: s.length > 0 && subs.some((p) => p === s),
  }
}

const LAMPORTS_PER_SOL = 1_000_000_000

function lamportsToSolString(lamports: number): string {
  const whole = Math.floor(lamports / LAMPORTS_PER_SOL)
  const frac = lamports % LAMPORTS_PER_SOL
  if (frac === 0) return `${whole} SOL`
  const fracStr = String(frac).padStart(9, '0').replace(/0+$/, '')
  return `${whole}.${fracStr} SOL`
}

function solInputToLamports(solStr: string): number | null {
  const t = solStr.trim()
  if (!t) return 0
  const n = Number.parseFloat(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * LAMPORTS_PER_SOL)
}

/** 本浏览器内：某仲裁员已对某托管投过票（广播成功后写入，用于禁用重复投票） */
const ARB_VOTE_STORAGE_KEY = 'bookchain:arb-voted-escrows:v1'

function readArbitratorVoteIndex(): Record<string, string[]> {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(ARB_VOTE_STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue
      out[k.trim()] = v.filter((x): x is string => typeof x === 'string').map((x) => x.trim())
    }
    return out
  } catch {
    return {}
  }
}

function hasArbitratorVotedOnEscrow(escrowPda: string, arbitratorPubkey: string): boolean {
  const pda = escrowPda.trim()
  const arb = arbitratorPubkey.trim()
  const list = readArbitratorVoteIndex()[pda]
  return Array.isArray(list) && list.includes(arb)
}

function recordArbitratorVote(escrowPda: string, arbitratorPubkey: string) {
  if (typeof sessionStorage === 'undefined') return
  const pda = escrowPda.trim()
  const arb = arbitratorPubkey.trim()
  const idx = readArbitratorVoteIndex()
  const prev = idx[pda] ?? []
  if (!prev.includes(arb)) prev.push(arb)
  idx[pda] = prev
  sessionStorage.setItem(ARB_VOTE_STORAGE_KEY, JSON.stringify(idx))
}

type VoteOutcome =
  | null
  | { ok: true; msg: string; signature: string }
  | { ok: false; message: string }

export function ArbitrationWorkbenchPage() {
  const { publicKey, signTransaction, signMessage } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const { user, sessionStatus, isAuthenticated, login, authLoading, authError } = useAuth()
  const [orders, setOrders] = useState<ArbitrationDisputeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [voteOpen, setVoteOpen] = useState(false)
  const [active, setActive] = useState<ArbitrationDisputeOrder | null>(null)
  const [choice, setChoice] = useState<'buyer' | 'seller'>('buyer')
  const [refundSol, setRefundSol] = useState('0')
  const [returnBook, setReturnBook] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [voteOutcome, setVoteOutcome] = useState<VoteOutcome>(null)
  const [voteLocalTick, setVoteLocalTick] = useState(0)
  const walletPk = publicKey?.toBase58() ?? ''
  const sessionPk = user?.pubkey?.trim() ?? ''

  const load = useCallback(async () => {
    if (!env.apiBaseUrl || env.useMockData) {
      setOrders([])
      setError('未配置 API 或处于 Mock 模式')
      setLoading(false)
      return
    }
    if (!isArbitratorPubkey(sessionPk)) {
      setOrders([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchArbitrationDisputes(1, 50)
      setOrders(res.orders ?? [])
    } catch (e) {
      setOrders([])
      setError(e instanceof ApiError ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [sessionPk])

  useEffect(() => {
    if (sessionStatus === 'authenticated' && isArbitratorPubkey(sessionPk)) {
      void load()
    } else {
      setLoading(false)
      setOrders([])
    }
  }, [load, sessionPk, sessionStatus])

  function openVote(row: ArbitrationDisputeOrder) {
    setActive(row)
    setChoice('buyer')
    setRefundSol('0')
    setReturnBook(false)
    setSubmitErr(null)
    setVoteOutcome(null)
    setVoteOpen(true)
  }

  function closeVoteDialog() {
    setVoteOpen(false)
    setActive(null)
    setVoteOutcome(null)
    setSubmitErr(null)
  }

  async function submitVote() {
    if (!active || !publicKey || !signTransaction) return
    const arb = publicKey.toBase58()
    const maxLamports = Math.max(0, Math.floor(active.price))
    let refundLamports = solInputToLamports(refundSol)
    if (refundLamports === null) {
      setSubmitErr('退款 SOL 格式无效')
      return
    }
    if (refundLamports > maxLamports) {
      setSubmitErr('退款不能超过托管金额')
      return
    }
    if (choice === 'seller' && (refundLamports > 0 || returnBook)) {
      setSubmitErr('支持卖家时无需填写退款/退书（链上按卖家胜处理）')
      return
    }
    setSubmitting(true)
    setSubmitErr(null)
    setVoteOutcome(null)
    try {
      const built = await buildResolveDispute({
        arbitrator: arb,
        buyer: active.buyer,
        seller: active.seller,
        asset: active.asset,
        collection: active.collection,
        choice: choice === 'buyer' ? 1 : 2,
        refund_amount: refundLamports,
        return_book: choice === 'buyer' ? returnBook : false,
      })
      const signed = await signEscrowTxWithWallet(built.tx, signTransaction)
      const res = await broadcastResolveDispute({
        signed_tx: signed,
        escrow_pda: active.escrow_pda,
        asset: active.asset,
        seller: active.seller,
        buyer: active.buyer,
        choice: choice === 'buyer' ? 1 : 2,
      })
      recordArbitratorVote(active.escrow_pda, arb)
      setVoteLocalTick((n) => n + 1)
      setVoteOutcome({
        ok: true,
        msg: res.msg?.trim() ? res.msg : '投票已成功广播到链上。',
        signature: res.signature,
      })
      await load()
    } catch (e) {
      setVoteOutcome({
        ok: false,
        message: e instanceof ApiError ? e.message : e instanceof Error ? e.message : '提交失败',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!publicKey) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-muted-foreground">请先连接钱包。</p>
        <Button onClick={openWalletConnect}>连接钱包</Button>
        <Button variant="outline" asChild>
          <Link href={routes.pending}>返回订单</Link>
        </Button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-muted-foreground">请使用仲裁员钱包完成站点登录。</p>
        <Button
          disabled={authLoading || !publicKey || !signMessage}
          onClick={() => void login({ publicKey, signMessage })}
        >
          {authLoading ? '处理中…' : '验证登录'}
        </Button>
        {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
      </div>
    )
  }

  if (!isArbitratorPubkey(sessionPk)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 space-y-3 text-center">
        <p className="text-muted-foreground">
          当前登录账户不在仲裁员白名单内（链上程序 <code className="text-xs">ARBITRATORS</code> 与后端{' '}
          <code className="text-xs">ARBITRATOR_PUBKEYS</code> / 前端{' '}
          <code className="text-xs">NEXT_PUBLIC_ARBITRATOR_PUBKEYS</code> 需一致）。
        </p>
        <Button variant="outline" asChild>
          <Link href={routes.pending}>返回订单</Link>
        </Button>
      </div>
    )
  }

  if (walletPk !== sessionPk) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 space-y-3 text-center">
        <p className="text-destructive text-sm">
          已登录为仲裁员 <span className="font-mono">{shortenPubkey(sessionPk)}</span>，但当前连接钱包为{' '}
          <span className="font-mono">{shortenPubkey(walletPk)}</span>。请切换到登录所用钱包后再投票签名。
        </p>
        <Button variant="outline" asChild>
          <Link href={routes.pending}>返回订单</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="pb-24 md:pb-12 max-w-4xl mx-auto px-4 sm:px-6 pt-6 md:pt-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">仲裁工作台</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            展示数据库中状态为「仲裁中」的托管。链上需任两名仲裁员投同一边（买家或卖家）才结案；若你投的是使买家方达到 2
            票的那一笔，链上会采用<strong>该笔交易</strong>中的退款 lamports 与是否退书。
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={routes.pending}>返回订单</Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载争议队列…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">暂无「仲裁中」订单。</p>
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => {
            const maxL = Math.max(0, Math.floor(o.price))
            const { buyerSubmitted, sellerSubmitted } = disputeMaterialFlags(o)
            void voteLocalTick
            const votedHere = hasArbitratorVotedOnEscrow(o.escrow_pda, walletPk)
            return (
              <li
                key={o.escrow_pda}
                className="rounded-xl border border-border/70 bg-card p-4 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    托管 <span className="font-mono">{shortenPubkey(o.escrow_pda)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    更新 {new Date(o.updated_at * 1000).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 font-medium',
                      buyerSubmitted
                        ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                        : 'border-border bg-muted/50 text-muted-foreground',
                    )}
                  >
                    买方链下材料：{buyerSubmitted ? '已提交' : '未提交'}
                  </span>
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 font-medium',
                      sellerSubmitted
                        ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                        : 'border-border bg-muted/50 text-muted-foreground',
                    )}
                  >
                    卖方链下材料：{sellerSubmitted ? '已提交' : '未提交'}
                  </span>
                </div>
                <div className="grid gap-1 text-xs sm:text-sm">
                  <p>
                    <span className="text-muted-foreground">买家</span>{' '}
                    <a
                      className="font-mono text-primary hover:underline"
                      href={explorerAddressUrl(o.buyer)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenPubkey(o.buyer)}
                    </a>
                  </p>
                  <p>
                    <span className="text-muted-foreground">卖家</span>{' '}
                    <a
                      className="font-mono text-primary hover:underline"
                      href={explorerAddressUrl(o.seller)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenPubkey(o.seller)}
                    </a>
                  </p>
                  <p>
                    <span className="text-muted-foreground">金额</span>{' '}
                    <span className="font-medium">{lamportsToSolString(maxL)}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">资产</span>{' '}
                    <Link className="font-mono text-primary hover:underline" href={bookPublicHistory(o.asset)}>
                      {shortenPubkey(o.asset)}
                    </Link>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <Link href={arbitrationBriefing(o.escrow_pda)}>案卷（全页）</Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={votedHere ? 'secondary' : 'default'}
                    disabled={votedHere}
                    className={votedHere ? 'opacity-60 cursor-not-allowed' : ''}
                    onClick={() => openVote(o)}
                  >
                    {votedHere ? '已投票' : '投票签名'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={voteOpen}
        onOpenChange={(open) => {
          if (!open) closeVoteDialog()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{voteOutcome?.ok ? '投票成功' : voteOutcome && !voteOutcome.ok ? '投票未成功' : '仲裁投票'}</DialogTitle>
            <DialogDescription className="text-xs">
              {voteOutcome
                ? voteOutcome.ok
                  ? '交易已上链。若需两名仲裁员同边票，请等待另一名仲裁员投票。'
                  : '请根据下方说明修改后重试，或联系运维查看链上日志。'
                : '管理员已 partial sign；你确认后由钱包完成仲裁员签名并广播。'}
            </DialogDescription>
          </DialogHeader>
          {voteOutcome?.ok ? (
            <div className="space-y-3 py-2 text-sm">
              <p className="text-foreground leading-relaxed">{voteOutcome.msg}</p>
              <p className="text-xs text-muted-foreground">交易签名</p>
              <a
                className="font-mono text-xs text-primary hover:underline break-all"
                href={explorerTxUrl(voteOutcome.signature)}
                target="_blank"
                rel="noreferrer"
              >
                {voteOutcome.signature}
              </a>
              <p className="text-xs text-muted-foreground leading-relaxed">
                你本钱包对该托管的投票已记录；列表中「投票签名」将置灰，避免重复提交。
              </p>
            </div>
          ) : voteOutcome && !voteOutcome.ok ? (
            <div className="py-2">
              <p className="text-sm text-destructive leading-relaxed">{voteOutcome.message}</p>
            </div>
          ) : active ? (
            <div className="space-y-4 py-2">
              <RadioGroup
                value={choice}
                onValueChange={(v) => setChoice(v as 'buyer' | 'seller')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buyer" id="c-buyer" />
                  <Label htmlFor="c-buyer">支持买家</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="seller" id="c-seller" />
                  <Label htmlFor="c-seller">支持卖家</Label>
                </div>
              </RadioGroup>
              {choice === 'buyer' ? (
                <div className="space-y-2 rounded-lg border border-border/60 p-3 bg-secondary/20">
                  <Label className="text-xs">退给买家的 SOL（0 表示不退；仅当本票使买家方达 2 票时链上生效）</Label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={refundSol}
                    onChange={(e) => setRefundSol(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="rb"
                      checked={returnBook}
                      onCheckedChange={(c) => setReturnBook(c === true)}
                    />
                    <Label htmlFor="rb" className="text-xs font-normal cursor-pointer">
                      退书给卖家（NFT 回到卖家并恢复上架）
                    </Label>
                  </div>
                </div>
              ) : null}
              {submitErr ? <p className="text-xs text-destructive">{submitErr}</p> : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            {voteOutcome?.ok ? (
              <Button type="button" onClick={() => closeVoteDialog()}>
                知道了
              </Button>
            ) : voteOutcome && !voteOutcome.ok ? (
              <>
                <Button type="button" variant="outline" onClick={() => setVoteOutcome(null)}>
                  返回修改
                </Button>
                <Button type="button" onClick={() => void submitVote()} disabled={submitting || !signTransaction}>
                  {submitting ? '重试中…' : '重试'}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => closeVoteDialog()}>
                  取消
                </Button>
                <Button type="button" onClick={() => void submitVote()} disabled={submitting || !signTransaction}>
                  {submitting ? '签名中…' : '签名并广播'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
