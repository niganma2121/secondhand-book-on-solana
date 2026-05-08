import { apiFetch } from '@/lib/api/client'

export type ShippingAddressPayload = {
  id: number
  user_pubkey: string
  buyer_ciphertext: string
  buyer_nonce: string
  buyer_alg: string
  encryption_key_version: string
  is_default: boolean
  created_at: number
  updated_at: number
}

export type UpsertShippingAddressInput = {
  buyer_ciphertext: string
  buyer_nonce: string
  buyer_alg: string
  encryption_key_version: string
  is_default?: boolean
}

export async function fetchMyShippingAddresses() {
  return apiFetch<{ addresses: ShippingAddressPayload[] }>('/me/shipping-addresses')
}

export async function createMyShippingAddress(input: UpsertShippingAddressInput) {
  return apiFetch<{ address: ShippingAddressPayload }>('/me/shipping-addresses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updateMyShippingAddress(id: number, input: UpsertShippingAddressInput) {
  return apiFetch<{ address: ShippingAddressPayload }>(`/me/shipping-addresses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function deleteMyShippingAddress(id: number) {
  return apiFetch<{ msg: string }>(`/me/shipping-addresses/${id}`, {
    method: 'DELETE',
  })
}

export async function setDefaultMyShippingAddress(id: number) {
  return apiFetch<{ msg: string }>(`/me/shipping-addresses/${id}/default`, {
    method: 'POST',
  })
}
