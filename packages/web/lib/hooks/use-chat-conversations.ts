'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatConversation, ChatMessage } from '@/lib/types'
import {
  fetchChatConversations,
  fetchChatMessages,
  fetchChatWsTicket,
  type ChatMessageRow,
  type ConversationRow,
  type MessageContentJson,
} from '@/lib/api/chat'
import { env, getChatWebSocketUrl } from '@/lib/env'
import { getAccessToken } from '@/lib/auth/token-store'
import { useAuth } from '@/components/providers/auth-provider'
import { tryNormalizeSolanaPubkey } from '@/lib/solana-pubkey'

const LAST_SYNC_MSG_ID_KEY = 'bookchain_chat_last_msg_id'

function shortPubkey(pubkey: string) {
  if (pubkey.length <= 12) return pubkey
  return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`
}

function formatMsgTime(tsSeconds: number) {
  return new Date(tsSeconds * 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 后端混用秒 / 毫秒时间戳时的容错 */
function normalizeTs(ts: number): number {
  return ts > 10_000_000_000 ? Math.floor(ts / 1000) : ts
}

function formatConvTime(tsSeconds: number) {
  const d = new Date(tsSeconds * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function snippetFromContent(c: ConversationRow['last_content']): string {
  if (!c || typeof c !== 'object') return ''
  const t = (c as MessageContentJson).type
  const p = (c as MessageContentJson).payload as Record<string, unknown> | undefined
  if (t === 'Text' && p && typeof p.content === 'string') return p.content
  if (t === 'Image') return '[图片]'
  if (t === 'BookOffer') return '[书目报价]'
  return '[消息]'
}

function mapContentToUi(
  c: MessageContentJson,
  _from: ChatMessage['from'],
): Pick<ChatMessage, 'text' | 'imageUrl'> {
  if (c.type === 'Text' && c.payload && 'content' in c.payload) {
    return { text: String((c.payload as { content: string }).content) }
  }
  if (c.type === 'Image' && c.payload && 'url' in c.payload) {
    const p = c.payload as { url: string; caption?: string | null }
    return { imageUrl: p.url, text: p.caption ?? undefined }
  }
  return { text: '[不支持的消息类型]' }
}

function rowToChatMessage(row: ChatMessageRow, me: string): ChatMessage {
  const from = row.from_pubkey === me ? 'me' : 'seller'
  const { text, imageUrl } = mapContentToUi(row.content, from)
  return {
    id: String(row.id),
    from,
    text,
    imageUrl,
    time: formatMsgTime(normalizeTs(row.timestamp)),
    isRead: row.is_read,
  }
}

type WsChatEnvelope = {
  id?: number
  from?: string
  to?: string
  timestamp?: number
  content?: MessageContentJson | { type: 'ReadReceipt'; payload?: { message_id?: string; messageId?: string }; message_id?: string }
}

function mapWsToChatMessage(m: WsChatEnvelope, me: string): ChatMessage | null {
  if (
    m.id == null ||
    !m.from ||
    !m.to ||
    m.timestamp == null ||
    !m.content ||
    typeof m.content !== 'object'
  ) {
    return null
  }
  const c = m.content
  if (c.type === 'Delivered' || c.type === 'Typing' || c.type === 'System') {
    return null
  }
  if (c.type === 'ReadReceipt') {
    return null
  }
  if (c.type === 'Error') {
    return null
  }
  const from = m.from === me ? 'me' : 'seller'
  const base = mapContentToUi(c as MessageContentJson, from)
  return {
    id: String(m.id),
    from,
    ...base,
    time: formatMsgTime(normalizeTs(m.timestamp)),
    isRead: false,
  }
}

function otherParty(me: string, from: string, to: string): string {
  return from === me ? to : from
}

function dedupMessagesById(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of messages) {
    const prev = byId.get(m.id)
    if (!prev) {
      byId.set(m.id, m)
      continue
    }
    byId.set(m.id, {
      ...prev,
      ...m,
      // 一旦任一来源确认已读，则保留已读状态
      isRead: Boolean(prev.isRead) || Boolean(m.isRead),
    })
  }
  return Array.from(byId.values())
}

function parseIdBigInt(id: string | number | null | undefined): bigint | null {
  if (id == null) return null
  try {
    return BigInt(String(id))
  } catch {
    return null
  }
}

function mergeServerEcho(
  existing: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (incoming.from !== 'me') return dedupMessagesById([...existing, incoming])
  const idx = existing.findIndex(
    (m) =>
      m.id.startsWith('local-') &&
      m.from === 'me' &&
      (m.text ?? '') === (incoming.text ?? ''),
  )
  if (idx < 0) return dedupMessagesById([...existing, incoming])
  const copy = [...existing]
  copy[idx] = { ...incoming, isRead: copy[idx]?.isRead ?? incoming.isRead }
  return dedupMessagesById(copy)
}

export function useChatConversations() {
  const { user, isAuthenticated } = useAuth()
  const usingBackend = !env.useMockData && Boolean(env.apiBaseUrl)

  const initial = useMemo(() => [] as ChatConversation[], [])

  const [conversations, setConversations] = useState<ChatConversation[]>(initial)
  const [loadingList, setLoadingList] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const activePeerRef = useRef<string | null>(null)

  useEffect(() => {
    if (!usingBackend || !user || !isAuthenticated) return
    let cancelled = false
    ;(async () => {
      setLoadingList(true)
      try {
        const { conversations: rows } = await fetchChatConversations()
        if (cancelled) return
        const mapped: ChatConversation[] = []
        for (const r of rows) {
          const peer = r.peer_pubkey
          if (!peer) continue
          mapped.push({
            id: `conv-${peer}`,
            sellerName: shortPubkey(peer),
            sellerAddr: peer,
            bookTitle: '会话',
            bookCover: '/placeholder.svg',
            lastMsg: snippetFromContent(r.last_content),
            lastTime:
              r.last_timestamp != null ? formatConvTime(normalizeTs(r.last_timestamp)) : '',
            unread: Number(r.unread_count ?? 0),
            messages: [],
          })
        }
        setConversations(mapped)
      } catch {
        if (!cancelled) setConversations([])
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [usingBackend, user?.pubkey, isAuthenticated])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? getAccessToken() : null
    if (!usingBackend || !user || !isAuthenticated || !token) {
      setWsConnected(false)
      return
    }

    let ws: WebSocket | null = null
    let cancelled = false

    ;(async () => {
      try {
        const { ticket } = await fetchChatWsTicket()
        if (cancelled) return
        const url = getChatWebSocketUrl(ticket)
        if (!url) {
          setWsError('无法构造聊天 WebSocket 地址')
          return
        }
        setWsError(null)
        ws = new WebSocket(url)
        if (cancelled) {
          ws.close()
          return
        }
        const socket = ws
        wsRef.current = socket

        socket.onopen = () => {
          setWsConnected(true)
          const lastId = Number(
            typeof window !== 'undefined'
              ? window.localStorage.getItem(LAST_SYNC_MSG_ID_KEY) ?? '0'
              : '0',
          )
          socket.send(JSON.stringify({ action: 'Sync', data: { last_id: lastId } }))
        }

        socket.onclose = () => {
          setWsConnected(false)
          if (wsRef.current === socket) wsRef.current = null
        }

        socket.onerror = () => {
          setWsError('聊天连接异常，请刷新或重新登录')
          setWsConnected(false)
        }

        socket.onmessage = (ev) => {
          const me = user.pubkey
          try {
            const raw = JSON.parse(ev.data as string) as WsChatEnvelope
            if (raw.content?.type === 'ReadReceipt' && raw.from && raw.to) {
              const receipt = raw.content as {
                payload?: { message_id?: string; messageId?: string }
                message_id?: string
              }
              const readId = parseIdBigInt(
                receipt.payload?.message_id
                ?? receipt.payload?.messageId
                ?? receipt.message_id
              )
              if (readId != null && readId > BigInt(0)) {
                const peer = otherParty(me, raw.from, raw.to)
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.sellerAddr !== peer) return c
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.from !== 'me') return m
                        const mid = parseIdBigInt(m.id)
                        if (mid == null) return m
                        return mid <= readId ? { ...m, isRead: true } : m
                      }),
                    }
                  }),
                )
                // 兜底：用数据库权威状态对齐，避免偶发回执丢失/乱序导致 UI 不一致
                void ensurePeerMessagesLoaded(peer)
              }
              return
            }
            if (raw.id != null && raw.id > 0) {
              const cur = Number(window.localStorage.getItem(LAST_SYNC_MSG_ID_KEY) ?? '0')
              if (raw.id > cur) {
                window.localStorage.setItem(LAST_SYNC_MSG_ID_KEY, String(raw.id))
              }
            }

            const ui = mapWsToChatMessage(raw, me)
            if (!ui) return

            const peer = otherParty(me, raw.from!, raw.to!)
            const snippet = ui.text?.trim() || (ui.imageUrl ? '[图片]' : '')
            const incomingFromPeer = ui.from === 'seller'
            const readingThisConversation = incomingFromPeer && activePeerRef.current === peer
            if (readingThisConversation) {
              ui.isRead = true
              void ensurePeerMessagesLoaded(peer)
            }

            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.sellerAddr === peer)
              const prevMsgs = idx >= 0 ? prev[idx]!.messages : []
              const nextMsgs = mergeServerEcho(prevMsgs, ui)
              const nextConv: ChatConversation = {
                id: `conv-${peer}`,
                sellerName: shortPubkey(peer),
                sellerAddr: peer,
                bookTitle: idx >= 0 ? prev[idx]!.bookTitle : '会话',
                bookCover: idx >= 0 ? prev[idx]!.bookCover : '/placeholder.svg',
                lastMsg: snippet || '[消息]',
                lastTime: '刚刚',
                unread: idx >= 0
                  ? prev[idx]!.unread + (incomingFromPeer && !readingThisConversation ? 1 : 0)
                  : (incomingFromPeer && !readingThisConversation ? 1 : 0),
                messages: nextMsgs,
              }

              if (idx >= 0) {
                const copy = [...prev]
                copy[idx] = nextConv
                return copy
              }
              return [nextConv, ...prev]
            })
          } catch {
            /* ignore malformed */
          }
        }
      } catch {
        if (!cancelled) {
          setWsError('无法获取聊天握手票据，请重新登录')
        }
      }
    })()

    return () => {
      cancelled = true
      if (ws) {
        ws.onopen = null
        ws.onclose = null
        ws.onmessage = null
        ws.onerror = null
        ws.close()
      }
      if (wsRef.current === ws) wsRef.current = null
    }
  }, [usingBackend, user?.pubkey, isAuthenticated])

  const ensurePeerMessagesLoaded = useCallback(
    async (peerPubkey: string) => {
      if (!usingBackend || !user) return
      try {
        const { messages } = await fetchChatMessages(peerPubkey)
        let mapped = dedupMessagesById(messages.map((r) => rowToChatMessage(r, user.pubkey)))
        // 进入会话后，对方发给我的消息在当前端应立即视为已读，
        // 避免“先拉取未读快照，再标记已读”带来的 UI 回滚。
        mapped = mapped.map((m) =>
          m.from === 'seller' ? { ...m, isRead: true } : m,
        )
        setConversations((prev) =>
          prev.map((c) =>
            c.sellerAddr === peerPubkey ? { ...c, messages: mapped, unread: 0 } : c,
          ),
        )
      } catch {
        /* keep empty */
      }
    },
    [usingBackend, user],
  )

  const markConversationReadNow = useCallback(
    async (peerPubkey: string) => {
      activePeerRef.current = peerPubkey
      setConversations((prev) =>
        prev.map((c) =>
          c.sellerAddr === peerPubkey
            ? {
              ...c,
              unread: 0,
              messages: c.messages.map((m) =>
                m.from === 'seller' ? { ...m, isRead: true } : m,
              ),
            }
            : c,
        ),
      )
    },
    [],
  )

  const clearActiveConversation = useCallback(() => {
    activePeerRef.current = null
  }, [])

  const sendChatText = useCallback(
    (
      peerPubkey: string,
      text: string,
      localUi?: Pick<ChatMessage, 'variant' | 'meta'>,
    ): boolean => {
      if (!user || !text.trim()) return false
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setWsError('未连接到聊天服务，请稍后重试')
        return false
      }
      const cmd = {
        action: 'SendMessage',
        data: {
          id: 0,
          from: user.pubkey,
          to: peerPubkey,
          timestamp: 0,
          content: { type: 'Text', payload: { content: text.trim() } },
        },
      }
      ws.send(JSON.stringify(cmd))
      const t = text.trim()
      const localMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        from: 'me',
        text: t,
        time: '刚刚',
        isRead: false,
        ...(localUi?.variant || localUi?.meta
          ? { variant: localUi.variant, meta: localUi.meta }
          : {}),
      }
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.sellerAddr === peerPubkey)
        if (idx >= 0) {
          const nextMessages = dedupMessagesById([...(prev[idx]!.messages ?? []), localMsg])
          const copy = [...prev]
          copy[idx] = {
            ...copy[idx]!,
            lastMsg: t,
            lastTime: '刚刚',
            messages: nextMessages,
          }
          return copy
        }
        const conv: ChatConversation = {
          id: `conv-${peerPubkey}`,
          sellerName: shortPubkey(peerPubkey),
          sellerAddr: peerPubkey,
          bookTitle: '会话',
          bookCover: '/placeholder.svg',
          lastMsg: t,
          lastTime: '刚刚',
          unread: 0,
          messages: [localMsg],
        }
        return [conv, ...prev]
      })
      return true
    },
    [user],
  )

  /** 按地址打开会话（列表无则插入一条空会话，便于首条消息发给陌生人） */
  const openConversationWithPeer = useCallback(
    (rawAddress: string): ChatConversation | null => {
      if (!user) return null
      const pk = tryNormalizeSolanaPubkey(rawAddress)
      if (!pk || pk === user.pubkey) return null
      const fresh: ChatConversation = {
        id: `conv-${pk}`,
        sellerName: shortPubkey(pk),
        sellerAddr: pk,
        bookTitle: '会话',
        bookCover: '/placeholder.svg',
        lastMsg: '',
        lastTime: '',
        unread: 0,
        messages: [],
      }
      let out: ChatConversation = fresh
      setConversations((prev) => {
        const hit = prev.find((c) => c.sellerAddr === pk)
        if (hit) {
          out = hit
          return prev
        }
        out = fresh
        return [fresh, ...prev]
      })
      return out
    },
    [user],
  )

  return {
    conversations,
    setConversations,
    loadingList,
    wsConnected,
    wsError,
    usingBackend,
    ensurePeerMessagesLoaded,
    markConversationReadNow,
    clearActiveConversation,
    sendChatText,
    openConversationWithPeer,
  }
}
