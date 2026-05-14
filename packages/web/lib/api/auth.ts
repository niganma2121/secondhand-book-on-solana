import { apiFetch } from '@/lib/api/client'
import { env } from '@/lib/env'

function authPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${env.authPrefix}${normalized}`
}

type NonceResponse = {
  nonce: string
}

export type LoginResponse = {
  status?: string
  token?: string
  access_token?: string
}

/** 与 GET /api/auth/getme 响应对齐 */
export type CurrentUser = {
  pubkey: string
  username: string | null
  avatar: string | null
  trade_count: number
  sell_count: number
  buy_count: number
  /** 后端迁移后返回；旧会话可能缺省 */
  reputation_score?: number
  dispute_total?: number
  dispute_won?: number
  dispute_lost?: number
  /** GET /auth/getme、PATCH /me/profile 返回；缺省按 3 次展示 */
  username_changes_remaining_today?: number
}

/** 与 Axum `LoginRequest` 一致：签名为 Base58 编码的字节 */
export type LoginPayload = {
  address: string
  nonce: string
  signature: string
}

/** 后端要求查询参数 `pubkey`（见 get_nonce_handler） */
export async function requestNonce(address: string) {
  const query = new URLSearchParams({ pubkey: address })
  return apiFetch<NonceResponse>(`${authPath('/nonce')}?${query.toString()}`)
}

export async function loginWithSignature(payload: LoginPayload) {
  return apiFetch<LoginResponse>(authPath('/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function fetchMe() {
  return apiFetch<CurrentUser>(authPath('/getme'))
}

export async function logoutRequest() {
  return apiFetch<void>(authPath('/logout'), { method: 'GET' })
}
