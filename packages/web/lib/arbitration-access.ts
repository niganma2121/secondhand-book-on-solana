import { env } from '@/lib/env'

export function isArbitratorPubkey(pubkey: string | null | undefined): boolean {
  if (!pubkey?.trim()) return false
  return env.arbitratorPubkeys.includes(pubkey.trim())
}
