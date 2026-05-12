import { apiFetch } from '@/lib/api/client'

export type UpsertTrackingCipherInput = {
  seller_ciphertext: string
  seller_nonce: string
  seller_alg: string
  buyer_ciphertext?: string
  buyer_nonce?: string
  buyer_alg?: string
  encryption_key_version: string
}

export type TrackingCipherPayload = {
  escrow_pda: string
  buyer_pubkey: string
  seller_pubkey: string
  seller_ciphertext: string
  seller_nonce: string
  seller_alg: string
  buyer_ciphertext?: string | null
  buyer_nonce?: string | null
  buyer_alg?: string | null
  encryption_key_version: string
  updated_at: number
}

export async function upsertOrderTrackingCipher(escrowPda: string, input: UpsertTrackingCipherInput) {
  return apiFetch<{ msg: string }>(`/me/orders/${encodeURIComponent(escrowPda)}/tracking-cipher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function fetchOrderTrackingCipher(escrowPda: string) {
  return apiFetch<TrackingCipherPayload>(`/me/orders/${encodeURIComponent(escrowPda)}/tracking-cipher`)
}
