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
    assetId: b.id,
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
    source: 'listed',
  }
}

type BoughtBookCardDto = BookCardDto & {
  is_current_owner?: boolean
}

function boughtRowToMyBook(row: BoughtBookCardDto): MyBook {
  const b = bookCardDtoToBook(row)
  const isCurrentOwner = Boolean(row.is_current_owner)
  const isOnSale = row.status === 'Listed' || row.status === 'InEscrow'
  return {
    id: isCurrentOwner ? b.id : `${b.id}:history`,
    assetId: b.id,
    title: b.title,
    author: b.author,
    cover: b.cover,
    price: b.price,
    priceCny: b.priceCny,
    fxCnyPerSol: b.fxCnyPerSol,
    condition: b.condition,
    category: b.category,
    tokenId: b.tokenId,
    status: isCurrentOwner ? 'owned' : 'sold',
    listedAt: b.listedAt,
    purchasedAt: b.listedAt,
    purchasePrice: b.price,
    isCurrentOwner,
    isOnSale,
    source: 'purchased',
  }
}

async function loadMyBooks(): Promise<MyBook[]> {
  if (env.useMockData || !env.apiBaseUrl) {
    return []
  }
  const qs = new URLSearchParams({ page: '1', page_size: '100' })
  const [sellerRes, boughtRes, createdRes] = await Promise.all([
    apiFetch<{ books: BookCardDto[] }>(`/me/books?${qs}`),
    apiFetch<{ books: BoughtBookCardDto[] }>(`/me/bought?${qs}`),
    apiFetch<{ books: BookCardDto[] }>(`/me/books/created?${qs}`),
  ])
  const sellerRows = sellerRes.books ?? []
  const boughtRows = boughtRes.books ?? []
  const createdRows = createdRes.books ?? []
  const sellerBooks = sellerRows.map(sellerRowToMyBook)
  const boughtBooks = boughtRows.map(boughtRowToMyBook)
  const createdBooks = createdRows.map((row) => ({
    ...sellerRowToMyBook(row),
    id: `${row.asset}:created`,
    assetId: row.asset,
    source: 'created' as const,
  }))
  return [...sellerBooks, ...boughtBooks, ...createdBooks]
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
