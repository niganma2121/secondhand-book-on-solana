import { env } from '@/lib/env'
import { getAccessToken } from '@/lib/auth/token-store'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const DEFAULT_TIMEOUT_MS = 15_000

type FetchOptions = RequestInit & {
  /** 显式传入 Bearer；默认使用本地存储（与 Cookie 二选一或并存） */
  token?: string | null
  /** 覆盖默认超时（毫秒）；设为 0 表示不额外限制 */
  timeoutMs?: number
  /**
   * 为 true 时不自动附带本地 JWT（用于 `/users/:pubkey` 等匿名可读接口）。
   * 避免本地过期 token 仍写入 Authorization 导致部分环境下 401。
   */
  omitAuth?: boolean
}

function defaultCredentials(): RequestCredentials {
  return env.apiBaseUrl ? 'include' : 'same-origin'
}

function mergeAbortSignals(
  userSignal: AbortSignal | undefined | null,
  timeoutMs: number,
): AbortSignal | undefined {
  const sig = userSignal ?? undefined
  if (timeoutMs <= 0) return sig
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined
  if (!timeoutSignal) return sig
  if (!sig) return timeoutSignal
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([sig, timeoutSignal])
  }
  return sig
}

function parseErrorMessage(text: string, fallback: string) {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  try {
    const j = JSON.parse(trimmed) as { error?: string; message?: string }
    return j.error ?? j.message ?? trimmed
  } catch {
    return trimmed
  }
}

/**
 * 与 Axum 通信的统一入口；未配置 baseUrl 时不要调用，请走 data 层 + mock
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const base = env.apiBaseUrl
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_URL is not set')
  }
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  const omitAuth = options.omitAuth === true
  const bearer = omitAuth
    ? typeof options.token === 'string' && options.token.length > 0
      ? options.token
      : null
    : (options.token !== undefined ? options.token : getAccessToken())
  if (bearer) {
    headers.set('Authorization', `Bearer ${bearer}`)
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const { timeoutMs: _tm, token: _token, omitAuth: _omitAuth, ...fetchInit } = options
  const signal = mergeAbortSignals(fetchInit.signal, timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      ...fetchInit,
      signal,
      headers,
      credentials: options.credentials ?? defaultCredentials(),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(
        '请求超时：请确认 book_server 已启动，且 NEXT_PUBLIC_API_URL 端口与后端一致（当前示例 3005）',
        0,
      )
    }
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const message = parseErrorMessage(text, res.statusText)
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) {
    return undefined as T
  }
  const ct = res.headers.get('content-type')
  if (!ct?.includes('application/json')) {
    return undefined as T
  }
  return res.json() as Promise<T>
}
