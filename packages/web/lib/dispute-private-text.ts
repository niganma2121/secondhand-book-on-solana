/** 与待处理页提交时拼接格式一致：`pending-page` 将物流单号以该前缀单独成段写入 private_text */
const TRACKING_LINE_PREFIX = '【物流单号（仅仲裁员可见）】'

function trimTrackingFromLine(line: string): string | null {
  const t = line.trim()
  if (!t.startsWith(TRACKING_LINE_PREFIX)) return null
  const rest = t.slice(TRACKING_LINE_PREFIX.length).trim()
  return rest.length > 0 ? rest : null
}

/**
 * 将合并后的仅仲裁员可见正文拆成「补充说明」与「物流单号」展示用。
 * 兼容：段间一个或多个换行；物流段可能紧跟在补充说明下一行。
 */
export function splitDisputePrivateText(raw: string | null | undefined): {
  supplementary: string
  trackingNumber: string | null
} {
  if (raw == null) return { supplementary: '', trackingNumber: null }
  const full = String(raw).trim()
  if (!full) return { supplementary: '', trackingNumber: null }

  const lines = full.split('\n')
  const idx = lines.findIndex((line) => line.trimStart().startsWith(TRACKING_LINE_PREFIX))
  if (idx >= 0) {
    const trackingNumber = trimTrackingFromLine(lines[idx])
    const supplementary = lines
      .slice(0, idx)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { supplementary, trackingNumber }
  }

  const parts = full.split(/\n\n+/)
  const notes: string[] = []
  let tracking: string | null = null
  for (const part of parts) {
    const p = part.trim()
    const fromLine = trimTrackingFromLine(p)
    if (fromLine != null && p.split('\n').length === 1) {
      tracking = fromLine
    } else if (p.startsWith(TRACKING_LINE_PREFIX)) {
      tracking = trimTrackingFromLine(p)
    } else if (p) {
      notes.push(p)
    }
  }
  return { supplementary: notes.join('\n\n').trim(), trackingNumber: tracking }
}
