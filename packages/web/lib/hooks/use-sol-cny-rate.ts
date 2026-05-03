'use client'

import { useCallback, useEffect, useState } from 'react'
import { env } from '@/lib/env'

export type SolCnyRateSource = 'coingecko' | 'env'

export type SolCnyRateState = {
  /** 1 SOL 约合多少元人民币 */
  cnyPerSol: number | null
  source: SolCnyRateSource | null
  loading: boolean
  error: string | null
  updatedAt: number | null
}

const COINGECKO =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=cny'

export function useSolCnyRate() {
  const [state, setState] = useState<SolCnyRateState>({
    cnyPerSol: null,
    source: null,
    loading: true,
    error: null,
    updatedAt: null,
  })

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(COINGECKO)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { solana?: { cny?: number } }
      const cny = j.solana?.cny
      if (typeof cny === 'number' && Number.isFinite(cny) && cny > 0) {
        setState({
          cnyPerSol: cny,
          source: 'coingecko',
          loading: false,
          error: null,
          updatedAt: Date.now(),
        })
        return
      }
      throw new Error('invalid rate')
    } catch {
      const fallback = env.solCnyApprox
      if (fallback != null && fallback > 0) {
        setState({
          cnyPerSol: fallback,
          source: 'env',
          loading: false,
          error: null,
          updatedAt: Date.now(),
        })
      } else {
        setState({
          cnyPerSol: null,
          source: null,
          loading: false,
          error: '暂时无法取得实时汇率，请稍后点击刷新，或在环境变量配置 NEXT_PUBLIC_SOL_CNY_RATE 作为备用',
          updatedAt: null,
        })
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
