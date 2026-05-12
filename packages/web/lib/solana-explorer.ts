const CLUSTER = 'devnet' as const

export function explorerTxUrl(signature: string) {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=${CLUSTER}`
}

export function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=${CLUSTER}`
}
