import { apiFetch } from '@/lib/api/client'

export type EscrowOrder = {
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  cancelled_by?: string | null
  price: number
  state: string
  /** 当前登录用户是否已对该托管提交过评价 */
  my_review_submitted?: boolean
  /** 与链上一致：卖家锁单备发货后买家不可链上取消 */
  pre_ship_locked?: boolean
  /** 下单时冻结书目 JSON（与后端 escrows.book_snapshot 一致） */
  book_snapshot?: unknown | null
  shipping_commitment?: number[] | null
  created_at: number
  updated_at: number
  /** 首次进入仲裁的 Unix 秒（后端写入；用于「最晚处理」展示） */
  disputed_at?: number | null
}

export async function fetchMyBuyingOrders() {
  return apiFetch<{ orders: EscrowOrder[] }>('/me/orders/buying?page=1&page_size=50')
}

export async function fetchMySellingOrders() {
  return apiFetch<{ orders: EscrowOrder[] }>('/me/orders/selling?page=1&page_size=50')
}
