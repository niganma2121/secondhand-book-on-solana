import { apiFetch } from '@/lib/api/client'

export type UpsertShippingCipherInput = {
  seller_ciphertext: string
  seller_nonce: string
  seller_alg: string
  buyer_ciphertext?: string
  buyer_nonce?: string
  buyer_alg?: string
  encryption_key_version: string
}

export type ShippingCipherPayload = {
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

export async function upsertOrderShippingCipher(escrowPda: string, input: UpsertShippingCipherInput) {
  return apiFetch<{ msg: string }>(`/me/orders/${encodeURIComponent(escrowPda)}/shipping-cipher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function upsertOrderShippingCipherByAsset(asset: string, input: UpsertShippingCipherInput) {
  return apiFetch<{ msg: string; escrow_pda: string }>(
    `/me/orders/by-asset/${encodeURIComponent(asset)}/shipping-cipher`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

export async function fetchOrderShippingCipher(escrowPda: string) {
  return apiFetch<ShippingCipherPayload>(`/me/orders/${encodeURIComponent(escrowPda)}/shipping-cipher`)
}
