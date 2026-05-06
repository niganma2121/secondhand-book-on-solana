import { apiFetch } from '@/lib/api/client'

export type BookDetailDto = {
  asset: string
  collection: string
  seller: string
  price: number
  price_cny?: number | null
  fx_cny_per_sol?: number | null
  status: string
  name: string
  metadata_url: string
  cover_url?: string | null
  author?: string | null
  series?: string | null
  category: string
  condition: string
  created_at: number
}

export type BookImageDto = {
  id: number
  asset: string
  url: string
  sort: number
  created_at: number
}

export type BookDetailResponse = {
  book: BookDetailDto
  images: BookImageDto[]
}

export async function fetchBookDetail(asset: string): Promise<BookDetailResponse> {
  return apiFetch<BookDetailResponse>(`/books/${encodeURIComponent(asset)}`)
}
