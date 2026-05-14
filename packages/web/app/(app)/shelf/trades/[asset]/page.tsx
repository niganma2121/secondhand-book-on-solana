'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { ShelfMyEscrowTradesPage } from '@/components/features/book/shelf-my-escrow-trades-page'

export default function ShelfTradesRoutePage() {
  const params = useParams()
  const search = useSearchParams()
  const raw = params?.asset
  const asset = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : ''
  const escrowFilter = search.get('escrow')?.trim() || null
  return <ShelfMyEscrowTradesPage asset={asset} escrowFilter={escrowFilter} />
}
