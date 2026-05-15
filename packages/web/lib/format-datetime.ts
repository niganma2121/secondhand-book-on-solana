/** 解析 ISO 字符串、Unix 秒或毫秒时间戳 */
function parseTimestamp(value: string | number): Date | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const ms = value > 1e12 ? value : value * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const s = value.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 北京时间：2026年5月15日 */
export function formatBeijingDate(value: string | number): string {
  const d = parseTimestamp(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

/** 北京时间：2026年5月15日 00:30（不含秒） */
export function formatBeijingDateTime(value: string | number): string {
  const d = parseTimestamp(value)
  if (!d) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}
