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
  /** 仲裁员工作台（需登录且公钥在链上仲裁员白名单） */
  arbitration: '/arbitration',
} as const

/** 仲裁员：单托管案卷全页（材料 / 链上流水 / 私信） */
export function arbitrationBriefing(escrowPda: string) {
  const p = escrowPda.trim()
  return `${routes.arbitration}/briefing/${encodeURIComponent(p)}`
}

/** 公开：某本书在平台上的流转（book_events + escrow_events，地址脱敏） */
export function bookPublicHistory(asset: string) {
  return `/books/${encodeURIComponent(asset)}/history`
}

/** 登录后：我与该 asset 相关的托管事件流水（完整地址）。可选 `escrowPda` 仅展示该托管地址下的事件。 */
export function shelfMyEscrowTrades(asset: string, escrowPda?: string | null) {
  const base = `/shelf/trades/${encodeURIComponent(asset)}`
  const p = escrowPda?.trim()
  if (!p) return base
  return `${base}?escrow=${encodeURIComponent(p)}`
}

/** 市场页打开指定书籍详情（依赖市场页读取 `asset` 等查询参数） */
export function marketBookDetail(
  asset: string,
  opts?: { orderEscrow?: string; orderState?: string; returnTo?: string },
) {
  const p = new URLSearchParams()
  p.set('asset', asset.trim())
  if (opts?.orderEscrow?.trim()) {
    p.set('orderEscrow', opts.orderEscrow.trim())
    p.set('fromOrder', '1')
  }
  if (opts?.orderState?.trim()) {
    p.set('orderState', opts.orderState.trim())
  }
  const rt = opts?.returnTo?.trim()
  if (rt && rt.startsWith('/') && !rt.startsWith('//')) {
    p.set('returnTo', rt)
  }
  return `${routes.market}?${p.toString()}`
}

/** 打开与指定钱包的会话 */
export function chatWithPeer(peerPubkey: string) {
  const q = new URLSearchParams({ peer: peerPubkey })
  return `${routes.chat}?${q.toString()}`
}

/** 公开卖家 / 用户主页（信誉、在售、评价） */
export function userPublicProfile(pubkey: string) {
  return `/users/${encodeURIComponent(pubkey)}`
}

export type AppRoute = (typeof routes)[keyof typeof routes]
