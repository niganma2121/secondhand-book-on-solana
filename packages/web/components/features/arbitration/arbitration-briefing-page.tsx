'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '@/components/providers/auth-provider'
import { ArbitrationBriefingView } from '@/components/features/arbitration/arbitration-briefing-view'
import { Button } from '@/components/ui/button'
import { routes } from '@/config/routes'
import { fetchArbitrationBriefing, type ArbitrationBriefing } from '@/lib/api/arbitration'
import { ApiError } from '@/lib/api/client'
import { env } from '@/lib/env'
import { isArbitratorPubkey } from '@/lib/arbitration-access'
import { shortenPubkey } from '@/lib/format-seller'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'

export function ArbitrationBriefingPage({ escrowPda }: { escrowPda: string }) {
  const { publicKey, signMessage } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const { user, sessionStatus, isAuthenticated, login, authLoading, authError } = useAuth()
  const [data, setData] = useState<ArbitrationBriefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const walletPk = publicKey?.toBase58() ?? ''
  const sessionPk = user?.pubkey?.trim() ?? ''

  const load = useCallback(async () => {
    if (!escrowPda.trim()) {
      setErr('缺少托管地址')
      setLoading(false)
      return
    }
    if (!env.apiBaseUrl || env.useMockData) {
      setErr('未配置 API 或处于 Mock 模式')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    setData(null)
    try {
      const b = await fetchArbitrationBriefing(escrowPda.trim(), 120)
      setData(b)
    } catch (e) {
      setData(null)
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [escrowPda])

  useEffect(() => {
    if (
      sessionStatus === 'authenticated' &&
      isAuthenticated &&
      isArbitratorPubkey(sessionPk) &&
      walletPk === sessionPk
    ) {
      void load()
    } else if (sessionStatus !== 'loading') {
      setLoading(false)
      setData(null)
    }
  }, [isAuthenticated, load, sessionPk, sessionStatus, walletPk])

  if (sessionStatus === 'loading') {
    return (
      <div className="flex justify-center py-32 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    )
  }

  if (!publicKey) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4 text-base">
        <p className="text-muted-foreground">请先连接钱包。</p>
        <Button size="lg" onClick={openWalletConnect}>
          连接钱包
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href={routes.arbitration}>返回仲裁工作台</Link>
        </Button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4 text-base">
        <p className="text-muted-foreground">请使用仲裁员钱包完成站点登录后查看案卷。</p>
        <Button size="lg" disabled={authLoading || !signMessage} onClick={() => void login({ publicKey, signMessage })}>
          {authLoading ? '处理中…' : '验证登录'}
        </Button>
        {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
        <Button variant="outline" size="lg" asChild>
          <Link href={routes.arbitration}>返回仲裁工作台</Link>
        </Button>
      </div>
    )
  }

  if (!isArbitratorPubkey(sessionPk)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 space-y-4 text-center text-base text-muted-foreground">
        <p>当前账户不在仲裁员白名单内，无法查看案卷。</p>
        <Button variant="outline" size="lg" asChild>
          <Link href={routes.arbitration}>返回仲裁工作台</Link>
        </Button>
      </div>
    )
  }

  if (walletPk !== sessionPk) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 space-y-4 text-center text-base">
        <p className="text-destructive">
          已登录为仲裁员 <span className="font-mono">{shortenPubkey(sessionPk)}</span>，请切换连接钱包与之一致后再打开案卷。
        </p>
        <Button variant="outline" size="lg" asChild>
          <Link href={routes.arbitration}>返回仲裁工作台</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] pb-28 md:pb-16 text-foreground">
      <div className="max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold tracking-tight">仲裁案卷</h1>
            <p className="text-sm sm:text-base text-muted-foreground font-mono break-all">{escrowPda.trim()}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="lg" asChild>
              <Link href={routes.arbitration}>返回工作台</Link>
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void load()} disabled={loading}>
              {loading ? '刷新中…' : '重新加载'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground text-lg">
            <Loader2 className="h-8 w-8 animate-spin shrink-0" />
            加载案卷…
          </div>
        ) : err ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-base text-destructive">
            {err}
          </div>
        ) : data ? (
          <ArbitrationBriefingView data={data} layout="page" />
        ) : (
          <p className="text-lg text-muted-foreground py-12 text-center">无数据</p>
        )}
      </div>
    </div>
  )
}
