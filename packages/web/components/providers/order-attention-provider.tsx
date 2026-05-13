'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { fetchMyBuyingOrders, fetchMySellingOrders } from '@/lib/api/orders'

const STORAGE_KEY = 'bookchain_orders_seen_digest_v1'

function digestFromOrders(
  buy: { escrow_pda: string; state: string; updated_at: number }[],
  sell: { escrow_pda: string; state: string; updated_at: number }[],
): string {
  const rows = [...buy, ...sell].map((o) => `${o.escrow_pda}\t${o.state}\t${o.updated_at}`)
  rows.sort()
  return rows.join('\n')
}

type OrderAttentionContextValue = {
  orderAttentionDot: boolean
  /** 拉取最新订单摘要并标记为已读（进入订单页时调用） */
  markOrdersAttentionSeen: () => Promise<void>
}

const OrderAttentionContext = createContext<OrderAttentionContextValue | null>(null)

export function OrderAttentionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [digest, setDigest] = useState('')
  const [seenDigest, setSeenDigest] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSeenDigest(window.localStorage.getItem(STORAGE_KEY) ?? '')
  }, [])

  const refreshDigest = useCallback(async () => {
    if (!isAuthenticated) {
      setDigest('')
      return
    }
    try {
      const [buyRes, sellRes] = await Promise.all([
        fetchMyBuyingOrders(),
        fetchMySellingOrders(),
      ])
      setDigest(digestFromOrders(buyRes.orders, sellRes.orders))
    } catch {
      /* ignore */
    }
  }, [isAuthenticated])

  useEffect(() => {
    void refreshDigest()
    if (!isAuthenticated) return
    const id = window.setInterval(() => void refreshDigest(), 45_000)
    const onFocus = () => void refreshDigest()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [isAuthenticated, refreshDigest])

  const orderAttentionDot = useMemo(() => {
    if (!digest || !isAuthenticated) return false
    return digest !== seenDigest
  }, [digest, seenDigest, isAuthenticated])

  const markOrdersAttentionSeen = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const [buyRes, sellRes] = await Promise.all([
        fetchMyBuyingOrders(),
        fetchMySellingOrders(),
      ])
      const d = digestFromOrders(buyRes.orders, sellRes.orders)
      window.localStorage.setItem(STORAGE_KEY, d)
      setSeenDigest(d)
      setDigest(d)
    } catch {
      /* ignore */
    }
  }, [isAuthenticated])

  const value = useMemo(
    () => ({ orderAttentionDot, markOrdersAttentionSeen }),
    [orderAttentionDot, markOrdersAttentionSeen],
  )

  return <OrderAttentionContext.Provider value={value}>{children}</OrderAttentionContext.Provider>
}

export function useOrderAttention(): OrderAttentionContextValue {
  const ctx = useContext(OrderAttentionContext)
  if (!ctx) {
    throw new Error('useOrderAttention 必须在 OrderAttentionProvider 内使用')
  }
  return ctx
}
