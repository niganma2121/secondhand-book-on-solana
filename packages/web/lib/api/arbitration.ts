import { apiFetch } from '@/lib/api/client'
import type { ChatMessageRow } from '@/lib/api/chat'
import type { MyEscrowEventRow } from '@/lib/api/book-history'
import type { DisputeSubmissionResponse, DisputeSubmissionRevision } from '@/lib/api/dispute-submission'

export type ArbitrationDisputeOrder = {
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  price: number
  book_snapshot?: unknown | null
  collection: string
  updated_at: number
  /** 已提交链下争议材料的公钥列表（与 escrows.buyer / seller 比对） */
  dispute_submitters?: string[]
}

export async function fetchArbitrationDisputes(page = 1, pageSize = 30) {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return apiFetch<{ orders: ArbitrationDisputeOrder[] }>(
    `/me/arbitration/disputes?${qs.toString()}`,
    { method: 'GET' },
  )
}

/** 仲裁员：托管快照 + 双方材料（含 private）+ 链上流水 + 买卖双方私信线程（按条数上限截断） */
export type ArbitrationBriefingEscrow = {
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  price: number
  state: string
  pre_ship_locked?: boolean
  book_snapshot?: unknown
  created_at?: number
  updated_at?: number
  disputed_at?: number | null
}

export type ArbitrationBriefing = {
  escrow: ArbitrationBriefingEscrow
  submissions: DisputeSubmissionResponse[]
  /** 材料历次提交（仲裁员全量；与 GET dispute-submission 结构一致） */
  revisions?: DisputeSubmissionRevision[]
  events: MyEscrowEventRow[]
  messages: ChatMessageRow[]
}

export async function fetchArbitrationBriefing(escrowPda: string, pageSize = 80) {
  const qs = new URLSearchParams({
    page: '1',
    page_size: String(pageSize),
  })
  return apiFetch<ArbitrationBriefing>(
    `/me/arbitration/escrows/${encodeURIComponent(escrowPda)}/briefing?${qs.toString()}`,
    { method: 'GET', timeoutMs: 45_000 },
  )
}
