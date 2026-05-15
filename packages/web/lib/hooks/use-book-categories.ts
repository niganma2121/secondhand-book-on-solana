'use client'

import {
  fetchBookCategories,
  type BookCategoryOption,
} from '@/lib/api/book-categories'
import { useAsyncOnceList } from '@/lib/hooks/use-async-once-list'

export function useBookCategories() {
  const { rows, loading, error } = useAsyncOnceList<BookCategoryOption>(
    () => fetchBookCategories(),
    '加载分类失败',
  )
  return { categories: rows, loading, error }
}
