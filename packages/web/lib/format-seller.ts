/** 钱包地址缩短展示（Solana base58） */
export function shortenPubkey(pubkey: string, head = 4, tail = 4): string {
  const t = pubkey.trim()
  if (t.length <= head + tail + 2) return t
  return `${t.slice(0, head)}…${t.slice(-tail)}`
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
