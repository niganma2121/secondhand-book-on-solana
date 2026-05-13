import { Suspense } from 'react'
import { PendingPage } from '@/components/features/pending/pending-page'

export default function PendingRoutePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载中…</div>}>
      <PendingPage />
    </Suspense>
  )
}
