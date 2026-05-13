'use client'

import Link from 'next/link'

type ChatMessageBodyProps = {
  text: string
  variant: 'me' | 'peer'
}

function splitUrlChunks(line: string): { kind: 'text' | 'url'; value: string }[] {
  const out: { kind: 'text' | 'url'; value: string }[] = []
  const re = /https?:\/\/[^\s]+/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: line.slice(last, m.index) })
    out.push({ kind: 'url', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < line.length) out.push({ kind: 'text', value: line.slice(last) })
  if (out.length === 0) out.push({ kind: 'text', value: line })
  return out
}

export function ChatMessageBody({ text, variant }: ChatMessageBodyProps) {
  const linkClass =
    variant === 'me'
      ? 'underline font-medium text-primary-foreground/95'
      : 'underline font-medium text-primary'

  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={lineIdx} className={lineIdx > 0 ? 'block mt-1' : 'block'}>
          {splitUrlChunks(line).map((chunk, i) =>
            chunk.kind === 'url' ? (
              <ChatUrlChunk key={i} url={chunk.value} linkClass={linkClass} />
            ) : (
              <span key={i}>{chunk.value}</span>
            ),
          )}
        </span>
      ))}
    </>
  )
}

function ChatUrlChunk({ url, linkClass }: { url: string; linkClass: string }) {
  try {
    const u = new URL(url)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const same = Boolean(origin && u.origin === origin)
    const focus = u.searchParams.get('focus')
    const pending =
      u.pathname === '/pending' || u.pathname.endsWith('/pending')
    if (same && pending && focus) {
      return (
        <Link href={`${u.pathname}${u.search}`} className={linkClass}>
          查看本单订单
        </Link>
      )
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={`${linkClass} break-all`}>
        {url}
      </a>
    )
  } catch {
    return <span>{url}</span>
  }
}
