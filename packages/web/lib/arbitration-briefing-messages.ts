import type { MessageContentJson } from '@/lib/api/chat'

const SKIP_MESSAGE_TYPES = new Set([
  'Delivered',
  'ReadReceipt',
  'Typing',
  'MessageSeen',
  'Presence',
])

function tryParseJsonObject(raw: string): unknown | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const o = JSON.parse(t) as unknown
    if (typeof o === 'string') {
      try {
        return JSON.parse(o) as unknown
      } catch {
        return o
      }
    }
    return o
  } catch {
    return null
  }
}

/** 将 DB / API 可能返回的 string 或双重 JSON 规范为对象 */
function normalizeMessageContent(content: unknown): unknown {
  if (content != null && typeof content === 'string') {
    const parsed = tryParseJsonObject(content)
    if (parsed != null && typeof parsed === 'object') return parsed
    if (typeof parsed === 'string') return { type: 'Text', payload: { content: parsed } }
    return { type: 'Text', payload: { content: content.trim() } }
  }
  return content
}

export type BriefMessageParts =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'other'; label: string }
  | { kind: 'skip' }

/** 案卷：将站内信 content 解析为可读片段（兼容 JSON 字符串、系统回执过滤） */
export function briefMessageParts(content: unknown): BriefMessageParts {
  const raw = normalizeMessageContent(content)
  if (!raw || typeof raw !== 'object') {
    return { kind: 'other', label: '[空消息]' }
  }
  const c = raw as MessageContentJson & { type?: string }
  const typ = c.type ?? ''
  if (SKIP_MESSAGE_TYPES.has(typ)) {
    return { kind: 'skip' }
  }
  if (c.type === 'Text' && c.payload && typeof c.payload === 'object' && 'content' in c.payload) {
    return { kind: 'text', text: String((c.payload as { content: string }).content) }
  }
  if (c.type === 'Image' && c.payload && typeof c.payload === 'object' && 'url' in c.payload) {
    const p = c.payload as { url: string; caption?: string | null }
    return { kind: 'image', url: p.url, caption: p.caption ?? undefined }
  }
  if (c.type === 'BookOffer' && c.payload && typeof c.payload === 'object') {
    const p = c.payload as { title?: string; asset?: string }
    const bit = [p.title, p.asset].filter(Boolean).join(' · ')
    return { kind: 'other', label: bit ? `[书目意向] ${bit}` : '[书目意向]' }
  }
  return { kind: 'other', label: c.type ? `[${c.type}]` : '[未知类型]' }
}
