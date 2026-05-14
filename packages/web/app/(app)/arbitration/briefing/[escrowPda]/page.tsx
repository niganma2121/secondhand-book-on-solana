'use client'

import { useParams } from 'next/navigation'
import { ArbitrationBriefingPage } from '@/components/features/arbitration/arbitration-briefing-page'

export default function ArbitrationBriefingRoutePage() {
  const params = useParams()
  const raw = params?.escrowPda
  const segment = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : ''
  const escrowPda = segment ? decodeURIComponent(segment) : ''
  return <ArbitrationBriefingPage escrowPda={escrowPda} />
}
