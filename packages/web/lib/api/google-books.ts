import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'

export type GoogleBooksHit = {
  volume_id: string
  title: string
  authors: string[]
  isbns: string[]
  cover_url: string | null
  published_year: number | null
  description: string | null
}

/** 列表 / 封面预览：后端已选较大尺寸的 HTTPS 封面图 */
export function resolveGoogleBooksCoverUrl(hit: GoogleBooksHit): string | null {
  const u = hit.cover_url?.trim()
  return u || null
}

/** GET /api/google-books/search — 无需登录；密钥仅在服务端 */
export async function searchGoogleBooks(q: string, limit = 12): Promise<GoogleBooksHit[]> {
  if (!env.apiBaseUrl) {
    throw new Error('请配置 NEXT_PUBLIC_API_URL 以使用网上查找')
  }
  const trimmed = q.trim()
  if (!trimmed) return []
  const json = await apiFetch<{ results: GoogleBooksHit[] }>(
    `/google-books/search?q=${encodeURIComponent(trimmed)}&limit=${encodeURIComponent(String(Math.min(20, Math.max(1, limit))))}`,
    { timeoutMs: 35_000 },
  )
  return json.results ?? []
}
