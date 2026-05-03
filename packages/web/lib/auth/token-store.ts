/**
 * 登录后写入 JWT；刷新页面时由 `AuthProvider` 再次请求 getMe，
 * 请求头会附带 Bearer（本存储）+ Cookie（HttpOnly，登录响应 Set-Cookie），二者任一有效即可。
 */
const ACCESS_TOKEN_KEY = 'bookchain_access_token'

function hasWindow() {
  return typeof window !== 'undefined'
}

export function getAccessToken(): string | null {
  if (!hasWindow()) return null
  return window.localStorage.getItem(ACCESS_TOKEN_KEY)
}

/** 是否有本地 JWT（用于 UI 提示「可尝试恢复会话」） */
export function hasStoredAccessToken(): boolean {
  return Boolean(getAccessToken())
}

export function setAccessToken(token: string) {
  if (!hasWindow()) return
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken() {
  if (!hasWindow()) return
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
}
