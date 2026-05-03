'use client'

import { useEffect, useState } from 'react'
import {
  fetchBookCategories,
  type BookCategoryOption,
} from '@/lib/api/book-categories'

export function useBookCategories() {
  const [categories, setCategories] = useState<BookCategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchBookCategories()
        if (!cancelled) {
          setCategories(rows)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载分类失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { categories, loading, error }
}
