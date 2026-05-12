'use client'

import { useParams } from 'next/navigation'
import { ShelfMyEscrowTradesPage } from '@/components/features/book/shelf-my-escrow-trades-page'

export default function ShelfTradesRoutePage() {
  const params = useParams()
  const raw = params?.asset
  const asset = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : ''
  return <ShelfMyEscrowTradesPage asset={asset} />
}
