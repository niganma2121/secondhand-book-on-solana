'use client'

import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '@/components/providers/auth-provider'
import {
  commKeyLocalStorageKey,
  ensureCommKeyReady,
} from '@/lib/encryption/comm-key-provision'
import { env } from '@/lib/env'

/**
 * 已登录且会话恢复时（未经过登录按钮），若本地尚无通讯私钥则补齐，避免买家/卖家交互时才缺少加密配置。
 */
export function CommKeyBootstrap() {
  const { isAuthenticated } = useAuth()
  const { publicKey, signMessage } = useWallet()
  const attemptedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isAuthenticated || !publicKey || !signMessage) return
    if (env.useMockData || !env.apiBaseUrl) return
    const addr = publicKey.toBase58()
    if (typeof localStorage !== 'undefined' && localStorage.getItem(commKeyLocalStorageKey(addr))) {
      return
    }
    if (attemptedRef.current.has(addr)) return
    attemptedRef.current.add(addr)
    void ensureCommKeyReady({ walletAddress: addr, signMessage }).catch((e) => {
      console.warn('[comm-key] 会话恢复后初始化失败', e)
    })
  }, [isAuthenticated, publicKey, signMessage])

  return null
}
