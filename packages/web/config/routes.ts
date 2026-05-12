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

/** 公开：某本书在平台上的流转（book_events + escrow_events，地址脱敏） */
export function bookPublicHistory(asset: string) {
  return `/books/${encodeURIComponent(asset)}/history`
}

/** 登录后：我与该 asset 相关的托管事件流水（完整地址） */
export function shelfMyEscrowTrades(asset: string) {
  return `/shelf/trades/${encodeURIComponent(asset)}`
}

/** 市场页打开指定书籍详情（依赖市场页读取 `asset` 查询参数） */
export function marketBookDetail(asset: string) {
  return `${routes.market}?asset=${encodeURIComponent(asset)}`
}

/** 打开与指定钱包的会话（对方完整 Base58 地址） */
export function chatWithPeer(peerPubkey: string) {
  return `${routes.chat}?peer=${encodeURIComponent(peerPubkey)}`
}

export type AppRoute = (typeof routes)[keyof typeof routes]
