import { apiFetch } from '@/lib/api/client'

export type EscrowOrder = {
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  cancelled_by?: string | null
  price: number
  state: string
  shipping_commitment?: number[] | null
  created_at: number
  updated_at: number
}

export async function fetchMyBuyingOrders() {
  return apiFetch<{ orders: EscrowOrder[] }>('/me/orders/buying?page=1&page_size=50')
}

export async function fetchMySellingOrders() {
  return apiFetch<{ orders: EscrowOrder[] }>('/me/orders/selling?page=1&page_size=50')
}
