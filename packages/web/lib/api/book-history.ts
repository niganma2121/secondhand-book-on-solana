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
