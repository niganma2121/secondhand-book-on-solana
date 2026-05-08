/**
 * 应用内路由（与 app 目录一一对应，供 Link / 重定向 / 运营位统一使用）
 */
export const routes = {
  home: '/',
  market: '/market',
  pending: '/pending',
  transactions: '/transactions',
  shelf: '/shelf',
  list: '/list',
  profile: '/profile',
  chat: '/chat',
} as const

/** 打开与指定钱包的会话（对方完整 Base58 地址） */
export function chatWithPeer(peerPubkey: string) {
  return `${routes.chat}?peer=${encodeURIComponent(peerPubkey)}`
}

export type AppRoute = (typeof routes)[keyof typeof routes]
