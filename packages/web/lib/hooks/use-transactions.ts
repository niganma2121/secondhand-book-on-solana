'use client'

import { useEffect, useState } from 'react'
import type { ChainTransaction } from '@/lib/types'
import { env } from '@/lib/env'
import { apiFetch, ApiError } from '@/lib/api/client'

export type TxScope = 'mine' | 'program'

async function loadTransactions(scope: TxScope): Promise<ChainTransaction[]> {
  if (env.useMockData || !env.apiBaseUrl) {
    return []
  }
  const qs = new URLSearchParams({ page: '1', page_size: '100' })
  const path = scope === 'mine' ? '/me/transactions' : '/transactions'
  const json = await apiFetch<{ transactions: ChainTransaction[] }>(
    `${path}?${qs.toString()}`,
  )
  return json.transactions ?? []
}

export function useTransactions(scope: TxScope) {
  const [transactions, setTransactions] = useState<ChainTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setUnauthorized(false)
    ;(async () => {
      try {
        const data = await loadTransactions(scope)
        if (!cancelled) setTransactions(data)
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError && e.status === 401 && scope === 'mine') {
            setTransactions([])
            setUnauthorized(true)
            setError(null)
          } else {
            setTransactions([])
            setError(e instanceof Error ? e : new Error('加载失败'))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scope])

  return { transactions, loading, error, unauthorized }
}
