/**
 * 公钥脱敏展示（仅前若干字符 + …），用于链上记录等公开卡片，避免完整地址被复制滥用。
 * 完整地址仍仅存于链上/后端；此处纯前端展示策略。
 */
export function privacyPubkey(pubkey: string, headChars = 3): string {
  const t = pubkey.trim()
  if (!t) return '—'
  if (t.length <= headChars) return t
  return `${t.slice(0, headChars)}…`
}

/** 钱包地址缩短展示（Solana base58） */
export function shortenPubkey(pubkey: string, head = 4, tail = 4): string {
  const t = pubkey.trim()
  if (t.length <= head + tail + 2) return t
  return `${t.slice(0, head)}…${t.slice(-tail)}`
}

/**
 * 聊天/对方卡片：优先昵称；无昵称时用「用户 + 公钥前三字脱敏」。
 */
export function peerDisplayTitle(username: string | null | undefined, pubkey: string): string {
  const n = username?.trim()
  if (n) return n
  const h = privacyPubkey(pubkey, 3)
  return h === '—' ? '匿名' : `用户 ${h}`
}

/**
 * 列表卡片：优先站内昵称，附带缩写公钥便于链上核对。
 */
export function formatSellerDisplay(pubkey: string, username?: string | null): string {
  const short = shortenPubkey(pubkey)
  const name = username?.trim()
  if (name) return `${name} · ${short}`
  return short
}
