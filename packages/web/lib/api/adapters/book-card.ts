import type { Book, BookCategory, BookCondition } from '@/lib/types'
import { CONDITION_DB_TO_ZH } from '@/lib/book-taxonomy'

/** 与 book_server 市场列表 `BookCardRow` 序列化字段对齐 */
export type BookCardDto = {
  asset: string
  seller: string
  price: number
  price_cny?: number | null
  fx_cny_per_sol?: number | null
  status: string
  name: string
  cover_url?: string | null
  author?: string | null
  category: string
  condition: string
  created_at: number
  seller_username?: string | null
}

export function bookCardDtoToBook(row: BookCardDto): Book {
  const conditionZh =
    CONDITION_DB_TO_ZH[row.condition] ?? (row.condition as BookCondition)
  return {
    id: row.asset,
    title: row.name,
    author: row.author ?? '',
    cover: row.cover_url ?? '/book-cover-placeholder.svg',
    price: row.price / 1_000_000_000,
    priceCny: row.price_cny ?? undefined,
    fxCnyPerSol: row.fx_cny_per_sol ?? undefined,
    condition: conditionZh,
    category: row.category as BookCategory,
    seller: row.seller,
    sellerUsername: row.seller_username ?? undefined,
    tokenId: row.asset,
    description: '',
    listedAt: new Date(row.created_at * 1000).toISOString(),
    favorites: 0,
  }
}
