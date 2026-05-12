'use client'

import { useParams } from 'next/navigation'
import { BookPublicHistoryPage } from '@/components/features/book/book-public-history-page'

export default function BookHistoryRoutePage() {
  const params = useParams()
  const raw = params?.asset
  const asset = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : ''
  return <BookPublicHistoryPage asset={asset} />
}
