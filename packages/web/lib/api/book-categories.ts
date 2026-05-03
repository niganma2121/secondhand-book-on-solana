import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'

export type BookCategoryOption = {
  key: string
  label: string
  sort_order: number
}

/** GET /api/books/categories — 公开接口 */
export async function fetchBookCategories(): Promise<BookCategoryOption[]> {
  if (!env.apiBaseUrl) return []
  const json = await apiFetch<{ categories: BookCategoryOption[] }>('/books/categories')
  return json.categories ?? []
}
