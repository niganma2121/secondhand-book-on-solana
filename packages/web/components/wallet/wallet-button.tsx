'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

export function WalletButton() {
  const { connection } = useConnection()
  const { publicKey, disconnect, connecting, signMessage } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const [copied, setCopied] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [airdropLoading, setAirdropLoading] = useState(false)
  const [airdropStatus, setAirdropStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const { isAuthenticated, sessionStatus, authLoading, authError, login, logout } =
    useAuth()
  const networkLabel = 'Devnet'

  async function handleCopy() {
    if (!publicKey) return
    await navigator.clipboard.writeText(publicKey.toBase58())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleVerifyLogin() {
    if (!signMessage) {
      return
    }
    await login({ publicKey: publicKey!, signMessage })
  }

  async function refreshBalance() {
    if (!publicKey) return
    setBalanceLoading(true)
    try {
      const lamports = await connection.getBalance(publicKey, 'confirmed')
      setBalance(lamports / LAMPORTS_PER_SOL)
    } finally {
      setBalanceLoading(false)
    }
  }

  async function handleAirdrop() {
    if (!publicKey || airdropLoading) return
    setAirdropLoading(true)
    setAirdropStatus('idle')
    try {
      const signature = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL)
      const latest = await connection.getLatestBlockhash('confirmed')
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed'
      )
      await refreshBalance()
      setAirdropStatus('success')
      setTimeout(() => setAirdropStatus('idle'), 3000)
    } catch (e) {
      setAirdropStatus('error')
      setTimeout(() => setAirdropStatus('idle'), 3000)
    } finally {
      setAirdropLoading(false)
    }
  }

  useEffect(() => {
    if (!publicKey) {
      setBalance(null)
      setAirdropStatus('idle')
      return
    }
    void refreshBalance()
  }, [publicKey, connection])

  const airdropText = airdropLoading
    ? '领取中...'
    : airdropStatus === 'success'
      ? '领取成功'
      : airdropStatus === 'error'
        ? '领取失败'
        : '领取 1 SOL (Devnet)'

  const airdropClassName =
    airdropStatus === 'success'
      ? 'cursor-pointer text-sm text-emerald-600 focus:bg-emerald-600/10 focus:text-emerald-600'
      : airdropStatus === 'error'
        ? 'cursor-pointer text-sm text-destructive focus:bg-destructive/10 focus:text-destructive'
        : 'cursor-pointer text-sm focus:bg-secondary'

  // ① 未连接钱包
  if (!publicKey) {
    return (
      <Button
        type="button"
        onClick={openWalletConnect}
        disabled={connecting}
        className="bg-primary text-primary-foreground font-semibold text-sm px-4 h-9 rounded-lg hover:opacity-90 transition-opacity"
      >
        {connecting ? (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            连接中...
          </span>
        ) : (
          '连接钱包'
        )}
      </Button>
    )
  }

  // ② 已连接，正在确认是否已有后端会话
  if (sessionStatus === 'loading') {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className="border-primary/40 text-muted-foreground font-semibold text-sm px-4 h-9 rounded-lg gap-2"
      >
        <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
        会话校验中…
      </Button>
    )
  }

  // ③ 已连接钱包，但尚未后端登录：琥珀色呼吸按钮 → 点击后 nonce + signMessage + POST /login
  if (!isAuthenticated) {
    const canSign = typeof signMessage === 'function'

    return (
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col items-end gap-0.5">
          <Button
            type="button"
            onClick={() => void handleVerifyLogin()}
            disabled={authLoading || !canSign}
            className={[
              'font-semibold text-sm px-4 h-9 rounded-lg transition-[filter,box-shadow]',
              !canSign
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : authLoading
                  ? 'bg-amber-500 text-amber-950'
                  : 'bg-amber-500 text-amber-950 hover:bg-amber-400 animate-wallet-verify-breathe',
            ].join(' ')}
          >
            {authLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-amber-950 border-t-transparent animate-spin" />
                正在向服务器验证签名…
              </span>
            ) : !canSign ? (
              '当前钱包不支持签名'
            ) : (
              '点击验证登录'
            )}
          </Button>
          {!canSign && (
            <p className="text-[10px] text-amber-600/90 max-w-[220px] text-right leading-tight">
              请换用 Phantom / Solflare 等支持「签署消息」的钱包
            </p>
          )}
          {authError && (
            <p className="text-[10px] text-destructive max-w-[220px] text-right leading-tight">
              {authError}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 border-border text-muted-foreground"
              aria-label="钱包更多操作"
              type="button"
            >
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-card border-border">
            <div className="px-3 py-2">
              <p className="text-[11px] text-muted-foreground">当前钱包</p>
              <p className="text-xs font-mono text-foreground mt-0.5 truncate">
                {shortenAddress(publicKey.toBase58())}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                网络: {networkLabel}
              </p>
              <p className="text-[11px] text-muted-foreground">
                余额: {balanceLoading ? '加载中...' : `${(balance ?? 0).toFixed(3)} SOL`}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                void handleAirdrop()
              }}
              disabled={airdropLoading}
              className={airdropClassName}
            >
              {airdropLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  {airdropText}
                </span>
              ) : (
                airdropText
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleCopy}
              className="cursor-pointer text-sm focus:bg-secondary"
            >
              {copied ? '已复制！' : '复制地址'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                window.open(
                  `https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`,
                  '_blank'
                )
              }
              className="cursor-pointer text-sm focus:bg-secondary"
            >
              在 Explorer 中查看
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => disconnect()}
              className="cursor-pointer text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              断开钱包
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  // ④ 后端已登录：显示地址 + 菜单
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-primary/40 text-foreground font-mono text-sm px-3 h-9 rounded-lg gap-2 hover:border-primary hover:bg-primary/10 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          {shortenAddress(publicKey.toBase58())}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-sans">
            {networkLabel}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 bg-card border-border">
        <div className="px-3 py-2">
          <p className="text-[11px] text-muted-foreground">已登录</p>
          <p className="text-sm font-mono text-foreground mt-0.5 truncate">
            {publicKey.toBase58()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">网络: {networkLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            余额: {balanceLoading ? '加载中...' : `${(balance ?? 0).toFixed(3)} SOL`}
          </p>
        </div>
        {authError && (
          <>
            <DropdownMenuSeparator className="bg-border" />
            <div className="px-3 py-2 text-[11px] text-destructive break-all">{authError}</div>
          </>
        )}
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void handleAirdrop()
          }}
          disabled={airdropLoading}
          className={airdropClassName}
        >
          {airdropLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              {airdropText}
            </span>
          ) : (
            airdropText
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={handleCopy}
          className="cursor-pointer text-sm focus:bg-secondary"
        >
          {copied ? '已复制！' : '复制地址'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            window.open(
              `https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`,
              '_blank'
            )
          }
          className="cursor-pointer text-sm focus:bg-secondary"
        >
          在 Explorer 中查看
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={() => logout()}
          disabled={authLoading}
          className="cursor-pointer text-sm focus:bg-secondary"
        >
          {authLoading ? '退出中...' : '退出登录'}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={async () => {
            await logout()
            await disconnect()
          }}
          className="cursor-pointer text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          退出并断开钱包
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
