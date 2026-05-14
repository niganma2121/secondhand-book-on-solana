import { apiFetch } from '@/lib/api/client'

export type PublicBookHistoryEvent = {
  id: number
  created_at: number
  tx_signature?: string | null
}

export type PublicBookEvent = PublicBookHistoryEvent & {
  asset: string
  event_type: string
  from_owner?: string | null
  to_owner?: string | null
  escrow_pda?: string | null
  actor_pubkey?: string | null
  payload?: unknown
}

export type PublicEscrowEvent = PublicBookHistoryEvent & {
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  from_state?: string | null
  to_state: string
  action: string
  actor_pubkey?: string | null
  /** 与 `escrows.book_snapshot` 一致：本单创建时冻结的书目（多行事件重复同一份） */
  book_snapshot?: unknown
  /** 仲裁结案等结构化字段 */
  payload?: unknown
}

export type PublicBookHistoryResponse = {
  asset: string
  book_events: PublicBookEvent[]
  escrow_events: PublicEscrowEvent[]
}

/** GET /api/books/:asset/history （公开，地址已脱敏） */
export async function fetchPublicBookHistory(asset: string, page = 1, pageSize = 20) {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return apiFetch<PublicBookHistoryResponse>(`/books/${encodeURIComponent(asset)}/history?${qs}`)
}

export type MyEscrowEventRow = {
  id: number
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  from_state: string | null
  to_state: string
  action: string
  tx_signature?: string | null
  actor_pubkey?: string | null
  created_at: number
  book_snapshot?: unknown
  /** 仲裁结案等结构化字段 */
  payload?: unknown
}

export type MyAssetEscrowEventsResponse = {
  asset: string
  events: MyEscrowEventRow[]
}

/** GET /api/me/bought/:asset/escrow-events（需登录；仅返回当前用户作为买家或卖家的事件，地址完整） */
export async function fetchMyAssetEscrowEvents(asset: string, page = 1, pageSize = 50) {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return apiFetch<MyAssetEscrowEventsResponse>(
    `/me/bought/${encodeURIComponent(asset)}/escrow-events?${qs}`,
  )
}
