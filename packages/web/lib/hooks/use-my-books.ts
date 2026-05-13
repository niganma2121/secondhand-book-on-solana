'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import type { MyBook } from '@/lib/types'
import {
  type BookCardDto,
  bookCardDtoToBook,
} from '@/lib/api/adapters/book-card'
import { env } from '@/lib/env'
import { apiFetch } from '@/lib/api/client'

function sellerDbStatusToMyStatus(db: string): MyBook['status'] {
  if (db === 'Sold') return 'sold'
  return 'listed'
}

function sellerRowToMyBook(row: BookCardDto): MyBook {
  const b = bookCardDtoToBook(row)
  return {
    id: b.id,
    assetId: b.id,
    title: b.title,
    author: b.author,
    cover: b.cover,
    price: b.price,
    priceCny: b.priceCny,
    fxCnyPerSol: b.fxCnyPerSol,
    condition: b.condition,
    category: b.category,
    tokenId: b.tokenId,
    status: sellerDbStatusToMyStatus(row.status),
    listedAt: b.listedAt,
    source: 'listed',
    listingDbStatus: row.status,
  }
}

type BoughtBookCardDto = BookCardDto & {
  is_current_owner?: boolean
}

function boughtRowToMyBook(row: BoughtBookCardDto): MyBook {
  const b = bookCardDtoToBook(row)
  const isCurrentOwner = Boolean(row.is_current_owner)
  const isOnSale = row.status === 'Listed' || row.status === 'InEscrow'
  let status: MyBook['status']
  if (!isCurrentOwner) {
    status = 'sold'
  } else if (isOnSale) {
    status = 'listed'
  } else {
    status = 'owned'
  }
  return {
    id: isCurrentOwner ? b.id : `${b.id}:history`,
    assetId: b.id,
    title: b.title,
    author: b.author,
    cover: b.cover,
    price: b.price,
    priceCny: b.priceCny,
    fxCnyPerSol: b.fxCnyPerSol,
    condition: b.condition,
    category: b.category,
    tokenId: b.tokenId,
    status,
    listedAt: b.listedAt,
    purchasedAt: b.listedAt,
    purchasePrice: b.price,
    isCurrentOwner,
    isOnSale,
    source: 'purchased',
  }
}

/** 正在上架/交易中：买入视角里不再重复展示「持有」卡片 */
const ACTIVE_SELLER_DB_STATUSES = new Set(['Listed', 'InEscrow'])

export type MyBooksShelfSections = {
  /** 我发布的：卖家侧上架记录 */
  published: MyBook[]
  /** 我持有：买入视角当前持有，且未与卖家侧在售重复 */
  owned: MyBook[]
  /** 历史买入：曾买入且当前不在手 */
  history: MyBook[]
}

async function loadShelfSections(mePubkey: string | undefined): Promise<MyBooksShelfSections> {
  if (env.useMockData || !env.apiBaseUrl || !mePubkey) {
    return { published: [], owned: [], history: [] }
  }
  const qs = new URLSearchParams({ page: '1', page_size: '100' })
  const [sellerRes, boughtRes, createdRes] = await Promise.all([
    apiFetch<{ books: BookCardDto[] }>(`/me/books?${qs}`),
    apiFetch<{ books: BoughtBookCardDto[] }>(`/me/bought?${qs}`),
    apiFetch<{ books: BookCardDto[] }>(`/me/books/created?${qs}`),
  ])
  const sellerRows = sellerRes.books ?? []
  const boughtRows = boughtRes.books ?? []
  const createdRows = createdRes.books ?? []

  const published = sellerRows.map(sellerRowToMyBook)
  const boughtBooks = boughtRows.map(boughtRowToMyBook)

  const activeListingAssets = new Set(
    sellerRows.filter((r) => ACTIVE_SELLER_DB_STATUSES.has(r.status)).map((r) => r.asset),
  )

  const owned = boughtBooks.filter(
    (b) => Boolean(b.isCurrentOwner) && Boolean(b.assetId) && !activeListingAssets.has(b.assetId!),
  )

  const history = boughtBooks.filter((b) => !b.isCurrentOwner)

  const pubAssetSet = new Set(published.map((p) => p.assetId ?? p.id))
  const boughtAssetSet = new Set(boughtBooks.map((b) => b.assetId ?? b.id))

  const createdOnlyOwned: MyBook[] = []
  for (const row of createdRows) {
    if (pubAssetSet.has(row.asset) || boughtAssetSet.has(row.asset)) continue
    if (row.seller !== mePubkey) continue
    createdOnlyOwned.push({
      ...sellerRowToMyBook(row),
      id: `${row.asset}:created`,
      assetId: row.asset,
      source: 'created',
    })
  }

  return {
    published,
    owned: [...owned, ...createdOnlyOwned],
    history,
  }
}

export function useMyBooks() {
  const { publicKey } = useWallet()
  const me = publicKey?.toBase58()

  const [published, setPublished] = useState<MyBook[]>([])
  const [owned, setOwned] = useState<MyBook[]>([])
  const [history, setHistory] = useState<MyBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const books = useMemo(() => {
    const seen = new Set<string>()
    const out: MyBook[] = []
    for (const b of [...published, ...owned, ...history]) {
      const k = `${b.source ?? 'x'}:${b.id}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(b)
    }
    return out
  }, [published, owned, history])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadShelfSections(me)
      setPublished(data.published)
      setOwned(data.owned)
      setHistory(data.history)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('加载失败'))
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadShelfSections(me)
        if (!cancelled) {
          setPublished(data.published)
          setOwned(data.owned)
          setHistory(data.history)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error('加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me])

  return {
    books,
    published,
    owned,
    history,
    loading,
    error,
    refetch,
  }
}
