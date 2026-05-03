import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'

export type BookConditionOption = {
  key: string
  label: string
  description: string | null
  sort_order: number
}

/** GET /api/books/conditions — 公开接口 */
export async function fetchBookConditions(): Promise<BookConditionOption[]> {
  if (!env.apiBaseUrl) return []
  const json = await apiFetch<{ conditions: BookConditionOption[] }>(
    '/books/conditions',
  )
  return json.conditions ?? []
}
