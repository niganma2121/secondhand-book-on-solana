/**
 * 托管链上 action / 状态 → 用户可读中文（列表标题、说明、时间线强调色）
 */

import type { MyEscrowEventRow } from '@/lib/api/book-history'

/** 同一托管 PDA 为一笔订单；组内时间旧→新；订单组按「首条事件时间」旧→新（页面自上而下从早到晚） */
export function groupMyEscrowEventsByPda(events: MyEscrowEventRow[]): MyEscrowEventRow[][] {
  const byPda = new Map<string, MyEscrowEventRow[]>()
  for (const ev of events) {
    const list = byPda.get(ev.escrow_pda) ?? []
    list.push(ev)
    byPda.set(ev.escrow_pda, list)
  }
  for (const list of byPda.values()) {
    list.sort((a, b) => a.created_at - b.created_at || a.id - b.id)
  }
  const groups = Array.from(byPda.values())
  groups.sort((a, b) => {
    const ta = Math.min(...a.map((e) => e.created_at))
    const tb = Math.min(...b.map((e) => e.created_at))
    return ta - tb
  })
  return groups
}

/** 列表/时间线主标题（短） */
export function escrowActionTitle(action: string): string {
  const k = action.trim().toLowerCase()
  const map: Record<string, string> = {
    create_escrow: '买家下单 · 托管建立',
    ship: '卖家发货',
    confirm_receipt: '确认收货，交易完成',
    cancel: '订单取消',
    open_dispute: '发起仲裁',
    resolve_dispute: '仲裁裁决',
  }
  return map[k] ?? `托管 · ${action}`
}

/** 卡片/弹窗补充说明（可与标题同时展示） */
export function escrowActionDescription(action: string): string {
  const k = action.trim().toLowerCase()
  const map: Record<string, string> = {
    create_escrow: '买家已付款，托管订单建立，等待卖家发货。',
    ship: '卖家已标记发货，买家等待收货。',
    confirm_receipt: '买方已确认收货，资金释放给卖家，交易完成。',
    cancel: '订单取消，书籍恢复可售（具体以链上状态为准）。',
    open_dispute: '一方发起争议，托管进入仲裁流程。',
    resolve_dispute: '仲裁结果已执行，托管状态已更新。',
  }
  return map[k] ?? `链上动作「${action}」。请以链上状态与交易为准。`
}

/** 库内存储的托管状态（英）→ 中文 */
export function escrowStateZh(state: string | null | undefined): string {
  if (state == null || state === '') return '—'
  const map: Record<string, string> = {
    Paid: '待发货',
    Shipped: '已发货',
    Released: '已完成',
    Cancelled: '已取消',
    Disputed: '仲裁中',
  }
  return map[state] ?? state
}

/** 时间线是否使用红色强调（仲裁、取消类） */
export function isEscrowActionAlert(action: string): boolean {
  const a = action.trim().toLowerCase()
  return a === 'cancel' || a === 'open_dispute' || a === 'resolve_dispute'
}
