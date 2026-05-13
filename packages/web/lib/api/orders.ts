import { apiFetch } from '@/lib/api/client'

export type EscrowOrder = {
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  cancelled_by?: string | null
  price: number
  state: string
  /** 与链上一致：卖家锁单备发货后买家不可链上取消 */
  pre_ship_locked?: boolean
  /** 下单时冻结书目 JSON（与后端 escrows.book_snapshot 一致） */
  book_snapshot?: unknown | null
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
