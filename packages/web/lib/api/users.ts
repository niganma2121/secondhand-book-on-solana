import { ApiError, apiFetch } from '@/lib/api/client'
import {
  type BookCardDto,
  bookCardDtoToBook,
} from '@/lib/api/adapters/book-card'
import type { Book } from '@/lib/types'

/** 与后端 `UserRow` JSON 对齐（公开 GET /api/users/:pubkey） */
export type PublicUserProfile = {
  pubkey: string
  username: string | null
  avatar: string | null
  enc_pubkey: string | null
  trade_count: number
  sell_count: number
  buy_count: number
  reputation_score: number
  dispute_total: number
  dispute_won: number
  dispute_lost: number
  created_at: number
}

export type ReviewReputationAgg = {
  review_count: number
  avg_score: number
  good_count: number
}

export type UserReviewRow = {
  id: number
  escrow_pda: string
  reviewer: string
  reviewee: string
  score: number
  comment: string | null
  created_at: number
}

export type UserReviewsResponse = {
  reviews: UserReviewRow[]
  reputation: ReviewReputationAgg | null
}

/** 用户从未登录过时后端返回 404 → null */
export async function fetchPublicUser(pubkey: string): Promise<PublicUserProfile | null> {
  try {
    return await apiFetch<PublicUserProfile>(`/users/${encodeURIComponent(pubkey)}`, { omitAuth: true })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function fetchUserReviews(pubkey: string, page = 1, pageSize = 20) {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return apiFetch<UserReviewsResponse>(
    `/users/${encodeURIComponent(pubkey)}/reviews?${q.toString()}`,
    { omitAuth: true },
  )
}

export async function fetchSellerBooksPage(
  pubkey: string,
  page = 1,
  pageSize = 12,
): Promise<Book[]> {
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  const json = await apiFetch<{ books: BookCardDto[] }>(
    `/users/${encodeURIComponent(pubkey)}/books?${q.toString()}`,
    { omitAuth: true },
  )
  return (json.books ?? []).map(bookCardDtoToBook)
}
