'use client'

import { useEffect, useState } from 'react'
import type { ChainTransaction } from '@/lib/types'
import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'

async function loadTransactions(): Promise<ChainTransaction[]> {
  if (env.useMockData || !env.apiBaseUrl) {
    return []
  }
  return apiFetch<ChainTransaction[]>('/transactions')
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<ChainTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadTransactions()
        if (!cancelled) setTransactions(data)
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

  return { transactions, loading, error }
}
