'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import {
  type CurrentUser,
  fetchMe,
  loginWithSignature,
  logoutRequest,
  requestNonce,
} from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { clearAccessToken, setAccessToken } from '@/lib/auth/token-store'
import { env } from '@/lib/env'

type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated'

type LoginArgs = {
  publicKey: PublicKey
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>
}

type AuthContextValue = {
  user: CurrentUser | null
  sessionStatus: SessionStatus
  authLoading: boolean
  authError: string | null
  isAuthenticated: boolean
  login: (args: LoginArgs) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    if (env.useMockData || !env.apiBaseUrl) {
      clearAccessToken()
      setUser(null)
      setSessionStatus('unauthenticated')
      return
    }
    try {
      const me = await fetchMe()
      setUser(me)
      setSessionStatus('authenticated')
    } catch (e) {
      setUser(null)
      setSessionStatus('unauthenticated')
      // 仅会话失效时清除本地 JWT；网络抖动等保留 token，刷新页或重试仍可能恢复
      if (e instanceof ApiError && e.status === 401) {
        clearAccessToken()
      }
    }
  }, [])

  /** 挂载即校验会话；勿用 requestIdleCallback，否则用户很快连上钱包时 sessionStatus 仍停留在 loading，钱包按钮一直显示「会话校验中」 */
  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const login = useCallback(async ({ publicKey, signMessage }: LoginArgs) => {
    if (!signMessage) {
      throw new Error('当前钱包不支持消息签名，请更换钱包')
    }
    if (env.useMockData || !env.apiBaseUrl) {
      throw new Error(
        '未配置后端：请在 .env.local 设置 NEXT_PUBLIC_API_URL（含 /api），且不要使用纯占位模式（见 lib/env.ts）',
      )
    }
    setAuthLoading(true)
    setAuthError(null)
    try {
      const address = publicKey.toBase58()
      const { nonce } = await requestNonce(address)
      const encoded = new TextEncoder().encode(nonce)
      const signatureBytes = await signMessage(encoded)
      const signature = bs58.encode(signatureBytes)

      const res = await loginWithSignature({ address, nonce, signature })
      const token = res.token ?? res.access_token
      if (token) {
        setAccessToken(token)
      }
      const me = await fetchMe()
      setUser(me)
      setSessionStatus('authenticated')
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message || `请求失败（HTTP ${e.status}）`
          : e instanceof Error
            ? e.message
            : '登录失败'
      setAuthError(msg)
      throw e
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      try {
        await logoutRequest()
      } catch {
        // 仍清理本地态
      }
      clearAccessToken()
      setUser(null)
      setSessionStatus('unauthenticated')
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionStatus,
      authLoading,
      authError,
      isAuthenticated: sessionStatus === 'authenticated',
      login,
      logout,
      refreshSession,
    }),
    [user, sessionStatus, authLoading, authError, login, logout, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}
