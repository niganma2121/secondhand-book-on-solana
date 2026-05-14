'use client'

import { ESCROW_TIMELINE_SEGMENT_LABEL } from '@/lib/escrow-event-copy'

/** 托管时间线「上一段结束 → 下一段」分段：渐变横线 + 居中短标签（本书流转 / 我的托管流水共用） */
export function EscrowTimelineSegmentSeparator() {
  return (
    <div
      className="my-10 md:my-14 flex items-center gap-3 text-muted-foreground"
      role="separator"
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
      <span className="text-[11px] sm:text-xs font-medium shrink-0 px-2 text-center max-w-[16rem]">
        {ESCROW_TIMELINE_SEGMENT_LABEL}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border" />
    </div>
  )
}
