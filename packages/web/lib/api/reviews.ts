import { apiFetch } from '@/lib/api/client'

export type SubmitOrderReviewInput = {
  escrow_pda: string
  reviewee: string
  score: number
  comment?: string | null
}

export async function submitOrderReview(input: SubmitOrderReviewInput) {
  return apiFetch<{ msg: string }>('/me/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      escrow_pda: input.escrow_pda,
      reviewee: input.reviewee,
      score: input.score,
      comment: input.comment?.trim() ? input.comment.trim() : null,
    }),
  })
}
