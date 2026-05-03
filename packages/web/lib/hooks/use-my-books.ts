'use client'

import { useEffect, useState } from 'react'
import type { MyBook } from '@/lib/types'
import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'
import { myBooksFixture } from '@/mocks/fixtures/my-books'

async function loadMyBooks(): Promise<MyBook[]> {
  if (env.useMockData || !env.apiBaseUrl) {
    return myBooksFixture
  }
  return apiFetch<MyBook[]>('/me/books')
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
