'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/api/client'

/** 与后端 `FxRateSnapshot.source` 对齐（交叉汇率形如 cross_okx_currency_pages） */
export type SolCnyRateSource =
  | 'coingecko'
  | 'cryptocompare'
  | 'cache_stale'
  | 'env'
  | string

export type SolCnyRateState = {
  /** 1 SOL 约合多少元人民币 */
  cnyPerSol: number | null
  source: SolCnyRateSource | null
  loading: boolean
  error: string | null
  updatedAt: number | null
}

type FxRateResponse = {
  cny_per_sol: number
  source: SolCnyRateSource
  updated_at: number
}

export function useSolCnyRate() {
  const [state, setState] = useState<SolCnyRateState>({
    cnyPerSol: null,
    source: null,
    loading: true,
    error: null,
    updatedAt: null,
  })

  const refresh = useCallback(async (force = false) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const q = force ? '?refresh=1' : ''
      const j = await apiFetch<FxRateResponse>(`/stats/fx${q}`)
      const cny = j.cny_per_sol
      if (typeof cny === 'number' && Number.isFinite(cny) && cny > 0) {
        setState({
          cnyPerSol: cny,
          source: (j.source as SolCnyRateSource | undefined) ?? 'coingecko',
          loading: false,
          error: null,
          updatedAt: Number.isFinite(j.updated_at) ? j.updated_at * 1000 : Date.now(),
        })
        return
      }
      throw new Error('invalid rate')
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : '加载失败'
      setState({
        cnyPerSol: null,
        source: null,
        loading: false,
        error: msg,
        updatedAt: null,
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh: () => refresh(true) }
}
