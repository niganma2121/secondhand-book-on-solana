'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  canFetchMarketBooks,
  fetchMarketBooks,
  type MarketBooksSort,
} from '@/lib/api/market-books'
import type { Book } from '@/lib/types'

export type UseMarketBooksParams = {
  /** 搜索框原文，hook 内会做防抖后再请求 */
  keyword: string
  categoryKey: string | null
  conditionDb: string | null
  sortBy: MarketBooksSort | 'favorites'
  debounceMs?: number
}

export function useMarketBooks(params: UseMarketBooksParams) {
  const debounceMs = params.debounceMs ?? 380
  const [debouncedKeyword, setDebouncedKeyword] = useState(params.keyword)

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedKeyword(params.keyword),
      debounceMs,
    )
    return () => clearTimeout(t)
  }, [params.keyword, debounceMs])

  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const apiDepsKey = useMemo(
    () =>
      JSON.stringify({
        k: debouncedKeyword,
        cat: params.categoryKey,
        cond: params.conditionDb,
        sort: params.sortBy,
      }),
    [
      debouncedKeyword,
      params.categoryKey,
      params.conditionDb,
      params.sortBy,
    ],
  )

  const useRemoteList = canFetchMarketBooks()

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (useRemoteList) {
        setLoading(true)
        try {
          const sort =
            params.sortBy === 'favorites' ? 'newest' : params.sortBy
          const data = await fetchMarketBooks({
            keyword: debouncedKeyword,
            categoryKey: params.categoryKey ?? undefined,
            conditionDb: params.conditionDb ?? undefined,
            sortBy: sort,
            page: 1,
            pageSize: 100,
          })
          if (!cancelled) {
            let list = data
            if (params.sortBy === 'favorites') {
              list = [...list].sort((a, b) => b.favorites - a.favorites)
            }
            setBooks(list)
            setError(null)
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e : new Error('加载失败'))
            setBooks([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

      // 无 API：不接占位书目，列表为空（接好书创建后再展示）
      setLoading(true)
      try {
        if (!cancelled) {
          setBooks([])
          setError(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [apiDepsKey, useRemoteList])

  return { books, loading, error }
}
