/**
 * 应用内路由（与 app 目录一一对应，供 Link / 重定向 / 运营位统一使用）
 */
export const routes = {
  home: '/',
  market: '/market',
  transactions: '/transactions',
  shelf: '/shelf',
  list: '/list',
  profile: '/profile',
  chat: '/chat',
} as const

export type AppRoute = (typeof routes)[keyof typeof routes]
