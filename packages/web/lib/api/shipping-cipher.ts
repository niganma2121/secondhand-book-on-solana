import { apiFetch, ApiError } from '@/lib/api/client'

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

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

/**
 * 托管广播成功后数据库可能晚一拍写入；链上已确认时对该错误退避重试，避免用户看到失败。
 */
export async function upsertOrderShippingCipherByAssetWhenEscrowReady(
  asset: string,
  input: UpsertShippingCipherInput,
  opts?: { maxAttempts?: number },
) {
  const maxAttempts = opts?.maxAttempts ?? 10
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await upsertOrderShippingCipherByAsset(asset, input)
    } catch (e) {
      lastErr = e
      const retry =
        e instanceof ApiError &&
        e.status === 400 &&
        typeof e.message === 'string' &&
        e.message.includes('无活跃订单')
      if (!retry || attempt === maxAttempts) {
        throw e
      }
      await sleep(Math.min(350 * 2 ** (attempt - 1), 5000))
    }
  }
  throw lastErr
}

export async function fetchOrderShippingCipher(escrowPda: string) {
  return apiFetch<ShippingCipherPayload>(`/me/orders/${encodeURIComponent(escrowPda)}/shipping-cipher`)
}
