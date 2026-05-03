import { env } from '@/lib/env'
import {
  type BookCardDto,
  bookCardDtoToBook,
} from '@/lib/api/adapters/book-card'
import { apiFetch } from '@/lib/api/client'
import type { Book } from '@/lib/types'

export type MarketBooksSort = 'newest' | 'price_asc' | 'price_desc'

export type FetchMarketBooksParams = {
  keyword?: string
  /** `book_categories.key`，与上架入库一致 */
  categoryKey?: string | null
  /** 数据库 `books.condition`：New / LikeNew / … */
  conditionDb?: string | null
  sortBy?: MarketBooksSort
  page?: number
  pageSize?: number
}

export async function fetchMarketBooks(
  params: FetchMarketBooksParams,
): Promise<Book[]> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page ?? 1))
  sp.set('page_size', String(params.pageSize ?? 100))
  const kw = params.keyword?.trim()
  if (kw) sp.set('keyword', kw)
  if (params.categoryKey) sp.set('category', params.categoryKey)
  if (params.conditionDb) sp.set('condition', params.conditionDb)
  const sort = params.sortBy ?? 'newest'
  if (sort !== 'newest') sp.set('sort_by', sort)

  const json = await apiFetch<{ books: BookCardDto[] }>(
    `/books?${sp.toString()}`,
  )
  return (json.books ?? []).map(bookCardDtoToBook)
}

/** 未配置 API 时勿调用 */
export function canFetchMarketBooks(): boolean {
  return Boolean(env.apiBaseUrl) && !env.useMockData
}
