
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


export function arbitrationBriefing(escrowPda: string) {
  const p = escrowPda.trim()
  return `${routes.arbitration}/briefing/${encodeURIComponent(p)}`
}


export function bookPublicHistory(asset: string) {
  return `/books/${encodeURIComponent(asset)}/history`
}


export function shelfMyEscrowTrades(asset: string, escrowPda?: string | null) {
  const base = `/shelf/trades/${encodeURIComponent(asset)}`
  const p = escrowPda?.trim()
  if (!p) return base
  return `${base}?escrow=${encodeURIComponent(p)}`
}


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
