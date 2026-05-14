import { apiFetch } from '@/lib/api/client'
import type { BookCardDto } from '@/lib/api/adapters/book-card'

/** GET /api/me/favorites/ — 当前用户收藏的书籍卡片 */
export async function fetchMyFavorites(page = 1, pageSize = 50) {
  const qs = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return apiFetch<{ books: BookCardDto[] }>(`/me/favorites/?${qs.toString()}`, {
    method: 'GET',
    timeoutMs: 30_000,
  })
}

/** POST /api/me/favorites/:asset — 已收藏则取消，未收藏则添加 */
export async function postToggleFavorite(asset: string) {
  const a = asset.trim()
  return apiFetch<{ favorited: boolean }>(`/me/favorites/${encodeURIComponent(a)}`, {
    method: 'POST',
    timeoutMs: 20_000,
  })
}
