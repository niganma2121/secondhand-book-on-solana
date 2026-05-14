/**
 * 浏览器可读环境变量（NEXT_PUBLIC_*）
 *
 * API 基址须含协议、**端口（默认 3005）**、`/api`，例如 `http://127.0.0.1:3005/api`、
 * `http://10.141.210.224:3005/api`。漏写端口会变成访问 80 → 连接被拒绝。
 * `authPrefix` 默认为 `/auth`（完整路径形如 `/api/auth/nonce`）。
 *
 * useMockData：
 * - 显式 `NEXT_PUBLIC_USE_MOCK_DATA=false` → 不调 fixture
 * - 已配置 `NEXT_PUBLIC_API_URL` → 默认走真实接口（避免「填了 URL 却误留 MOCK=true」导致永远不接后端）
 * - 否则：未设置 MOCK 或与旧行为一致时默认 mock（纯前端预览）
 */
const rawApiUrlInput = process.env.NEXT_PUBLIC_API_URL?.trim() ?? ''
/** 未写 `http://` / `https://` 时浏览器会把地址当成相对路径，请求打到 Next 页面 → 返回 HTML 404 */
const rawApiUrl = (() => {
  let u = rawApiUrlInput.replace(/\/$/, '')
  if (u.length === 0) return ''
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
})()
/** 与 Axum `nest("/api", …)` 对齐；只填 `http://127.0.0.1:3005` 时会自动补 `/api`，避免漏 `/api` 导致 404 */
const apiBaseUrl = (() => {
  if (rawApiUrl.length === 0) return ''
  if (rawApiUrl.endsWith('/api')) return rawApiUrl
  try {
    const { pathname } = new URL(rawApiUrl)
    if (pathname.includes('/api/') || pathname === '/api') return rawApiUrl
  } catch {
    /* 非绝对 URL 时仅做末尾判断 */
  }
  return `${rawApiUrl}/api`
})()
const mockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA

/** 可选：1 SOL ≈ 多少元人民币，仅用于上架页「约合¥」提示；链上仍以 SOL/lamports 为准 */
const solCnyRaw = process.env.NEXT_PUBLIC_SOL_CNY_RATE?.trim()
const solCnyApproxParsed = solCnyRaw ? Number.parseFloat(solCnyRaw) : NaN
const solCnyApprox =
  Number.isFinite(solCnyApproxParsed) && solCnyApproxParsed > 0 ? solCnyApproxParsed : null

export const env = {
  apiBaseUrl,
  authPrefix:
    process.env.NEXT_PUBLIC_AUTH_PREFIX?.replace(/\/$/, '') ?? '/auth',
  useMockData:
    mockFlag === 'false'
      ? false
      : apiBaseUrl.length > 0
        ? false
        : mockFlag !== 'false',
  isDev: process.env.NODE_ENV === 'development',
  /** 未配置则不显示人民币参考价 */
  solCnyApprox,
  /** 与链上 `ARBITRATORS` 对齐；可用 `NEXT_PUBLIC_ARBITRATOR_PUBKEYS`（逗号分隔）覆盖 */
  arbitratorPubkeys: (() => {
    const raw = process.env.NEXT_PUBLIC_ARBITRATOR_PUBKEYS?.trim()
    if (raw) {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }
    const DEFAULT: string[] = [
      'A5JSJ3J184YKqB71dFG47XrmmxmZqTZRUah9udC4dsnZ',
      'CCiL4DCuzwKGSMYDDWA3E84XtNhsGc1SeWekNJvVF71j',
      'EKufV8XKB5QfX52xDbEjsYts8CHsiz8QihXCw9A6G6Fj',
    ]
    return DEFAULT
  })(),
} as const

/**
 * 先 `POST /chat/ws-ticket` 换短期 `ticket`，再 `?ticket=` 连接 WS（避免把 JWT 放进 URL）。
 */
export function getChatWebSocketUrl(ticket: string): string | null {
  const base = env.apiBaseUrl?.trim()
  if (!base || !ticket) return null
  try {
    const httpUrl = new URL(base.endsWith('/') ? base.slice(0, -1) : base)
    const wsScheme = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = `${httpUrl.pathname.replace(/\/$/, '')}/chat/ws`
    const wsUrl = new URL(`${wsScheme}//${httpUrl.host}${path}`)
    wsUrl.searchParams.set('ticket', ticket)
    return wsUrl.toString()
  } catch {
    return null
  }
}
