'use client'

import {
  fetchBookConditions,
  type BookConditionOption,
} from '@/lib/api/book-conditions'
import { useAsyncOnceList } from '@/lib/hooks/use-async-once-list'

export function useBookConditions() {
  const { rows, loading, error } = useAsyncOnceList<BookConditionOption>(
    () => fetchBookConditions(),
    '加载品相失败',
  )
  return { conditions: rows, loading, error }
}
