import { apiFetch } from '@/lib/api/client'

/** GET 返回：买卖双方不含 private_text；仲裁员为完整行 */
export type DisputeSubmissionResponse = {
  escrow_pda: string
  initiator: string
  public_text: string
  public_attachment_urls: unknown
  created_at: number
  private_text?: string | null
}

/** 每次保存材料追加一条；`revision_index` 为同一 initiator 下第几次（从 1 起） */
export type DisputeSubmissionRevision = {
  id: number
  revision_index: number
  initiator: string
  public_text: string
  public_attachment_urls: unknown
  created_at: number
  private_text?: string | null
}

export async function postDisputeSubmission(
  escrowPda: string,
  body: {
    public_text: string
    public_attachment_urls: string[]
    private_text?: string
  },
) {
  return apiFetch<{ msg: string }>(
    `/me/orders/${encodeURIComponent(escrowPda)}/dispute-submission`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: 60_000,
    },
  )
}

export async function getDisputeSubmission(escrowPda: string) {
  return apiFetch<{ submissions: DisputeSubmissionResponse[]; revisions: DisputeSubmissionRevision[] }>(
    `/me/orders/${encodeURIComponent(escrowPda)}/dispute-submission`,
    { method: 'GET', timeoutMs: 30_000 },
  )
}
