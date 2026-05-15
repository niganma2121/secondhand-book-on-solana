'use client'

import { useEffect, useRef, useState } from 'react'
import { toUserFacingMessage } from '@/lib/api/client'

/**
 * 挂载时拉取一次列表（取消竞态）；供分类/品相等静态字典复用。
 */
export function useAsyncOnceList<T>(
  load: () => Promise<T[]>,
  errorFallback: string,
) {
  const loadRef = useRef(load)
  loadRef.current = load

  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 仅挂载时拉取；load 经 ref 更新，与分类/品相字典「进页拉一次」语义一致
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadRef.current()
        if (!cancelled) {
          setRows(data)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(toUserFacingMessage(e, errorFallback))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, loading, error }
}
