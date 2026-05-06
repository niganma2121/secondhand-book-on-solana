import { apiFetch } from '@/lib/api/client'

type UnsignedTxResponse = {
  tx: string
  msg: string
}

type BroadcastResponse = {
  signature: string
  msg: string
}

export async function buildDelistBook(input: {
  seller: string
  asset: string
  collection: string
}) {
  return apiFetch<UnsignedTxResponse>('/book/delist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastDelistBook(input: {
  signed_tx: string
  asset: string
  seller: string
}) {
  return apiFetch<BroadcastResponse>('/book/delist/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function buildUpdatePrice(input: {
  seller: string
  asset: string
  new_price: number
}) {
  return apiFetch<UnsignedTxResponse>('/book/update-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastUpdatePrice(input: {
  signed_tx: string
  asset: string
  new_price: number
}) {
  return apiFetch<BroadcastResponse>('/book/update-price/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
