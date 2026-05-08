'use client'

import { useEffect, useState } from 'react'
import type { MyBook } from '@/lib/types'
import {
  type BookCardDto,
  bookCardDtoToBook,
} from '@/lib/api/adapters/book-card'
import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'

function sellerDbStatusToMyStatus(db: string): MyBook['status'] {
  if (db === 'Sold') return 'sold'
  return 'listed'
}

function sellerRowToMyBook(row: BookCardDto): MyBook {
  const b = bookCardDtoToBook(row)
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    cover: b.cover,
    price: b.price,
    priceCny: b.priceCny,
    fxCnyPerSol: b.fxCnyPerSol,
    condition: b.condition,
    category: b.category,
    tokenId: b.tokenId,
    status: sellerDbStatusToMyStatus(row.status),
    listedAt: b.listedAt,
  }
}

function boughtRowToMyBook(row: BookCardDto): MyBook {
  const b = bookCardDtoToBook(row)
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    cover: b.cover,
    price: b.price,
    priceCny: b.priceCny,
    fxCnyPerSol: b.fxCnyPerSol,
    condition: b.condition,
    category: b.category,
    tokenId: b.tokenId,
    status: 'owned',
    listedAt: b.listedAt,
    purchasedAt: b.listedAt,
    purchasePrice: b.price,
  }
}

async function loadMyBooks(): Promise<MyBook[]> {
  if (env.useMockData || !env.apiBaseUrl) {
    return []
  }
  const qs = new URLSearchParams({ page: '1', page_size: '100' })
  const [sellerRes, boughtRes] = await Promise.all([
    apiFetch<{ books: BookCardDto[] }>(`/me/books?${qs}`),
    apiFetch<{ books: BookCardDto[] }>(`/me/bought?${qs}`),
  ])
  const sellerRows = sellerRes.books ?? []
  const boughtRows = boughtRes.books ?? []
  const byId = new Map<string, MyBook>()
  for (const row of sellerRows) {
    byId.set(row.asset, sellerRowToMyBook(row))
  }
  for (const row of boughtRows) {
    byId.set(row.asset, boughtRowToMyBook(row))
  }
  return [...byId.values()]
}

export function useMyBooks() {
  const [books, setBooks] = useState<MyBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadMyBooks()
        if (!cancelled) setBooks(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error('加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { books, loading, error }
}
