import type { Book, BookCategory, BookCondition } from '@/lib/types'
import { CONDITION_DB_TO_ZH } from '@/lib/book-taxonomy'

/** 与 book_server 市场列表 `BookCardRow` 序列化字段对齐 */
export type BookCardDto = {
  asset: string
  seller: string
  price: number
  status: string
  name: string
  cover_url?: string | null
  author?: string | null
  category: string
  condition: string
  created_at: number
}

export function bookCardDtoToBook(row: BookCardDto): Book {
  const conditionZh =
    CONDITION_DB_TO_ZH[row.condition] ?? (row.condition as BookCondition)
  return {
    id: row.asset,
    title: row.name,
    author: row.author ?? '',
    cover: row.cover_url ?? '/placeholder.jpg',
    price: row.price / 1_000_000_000,
    condition: conditionZh,
    category: row.category as BookCategory,
    seller: row.seller,
    tokenId: row.asset,
    description: '',
    listedAt: new Date(row.created_at * 1000).toISOString(),
    favorites: 0,
  }
}
