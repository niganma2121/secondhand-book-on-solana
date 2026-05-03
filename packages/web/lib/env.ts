/**
 * 浏览器可读环境变量（NEXT_PUBLIC_*）
 *
 * API 基址建议包含 `/api`，与 book_server 一致，例如 `http://127.0.0.1:3005/api`。
 * `authPrefix` 默认为 `/auth`（完整路径形如 `/api/auth/nonce`）。
 *
 * useMockData：
 * - 显式 `NEXT_PUBLIC_USE_MOCK_DATA=false` → 不调 fixture
 * - 已配置 `NEXT_PUBLIC_API_URL` → 默认走真实接口（避免「填了 URL 却误留 MOCK=true」导致永远不接后端）
 * - 否则：未设置 MOCK 或与旧行为一致时默认 mock（纯前端预览）
 */
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '').trim() ?? ''
const mockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA

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
} as const
