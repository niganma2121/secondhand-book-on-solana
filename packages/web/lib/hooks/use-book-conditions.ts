'use client'

import { useEffect, useState } from 'react'
import {
  fetchBookConditions,
  type BookConditionOption,
} from '@/lib/api/book-conditions'

export function useBookConditions() {
  const [conditions, setConditions] = useState<BookConditionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchBookConditions()
        if (!cancelled) {
          setConditions(rows)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载品相失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { conditions, loading, error }
}
