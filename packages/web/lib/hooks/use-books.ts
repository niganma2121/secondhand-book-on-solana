'use client'

import { useEffect, useState } from 'react'
import type { Book } from '@/lib/types'
import { env } from '@/lib/env'
import {
  type BookCardDto,
  bookCardDtoToBook,
} from '@/lib/api/adapters/book-card'
import { apiFetch } from '@/lib/api/client'

async function loadBooks(): Promise<Book[]> {
  if (env.useMockData || !env.apiBaseUrl) {
    return []
  }
  // 与 Axum `nest("/books").route("/", …)` 一致，末尾勿加 /（否则会 404）
  const json = await apiFetch<{ books: BookCardDto[] }>('/books')
  return (json.books ?? []).map(bookCardDtoToBook)
}

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadBooks()
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
