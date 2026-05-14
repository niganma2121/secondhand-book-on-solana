import { apiFetch } from '@/lib/api/client'

/** 与 `book_server` `MessageRow` / JSON 内容对齐 */
export type ChatMessageRow = {
  id: number
  from_pubkey: string
  to_pubkey: string
  content: MessageContentJson
  timestamp: number
  is_read: boolean
}

export type MessageContentJson =
  | { type: 'Text'; payload: { content: string } }
  | { type: 'Image'; payload: { url: string; caption?: string | null } }
  | { type: string; payload?: Record<string, unknown> }

export type ConversationRow = {
  peer_pubkey: string | null
  last_content: MessageContentJson | null
  last_timestamp: number | null
  unread_count: number | null
  peer_username?: string | null
  peer_avatar?: string | null
}

export type WsTicketResponse = {
  ticket: string
  expires_in: number
}

/** 用当前 JWT 换短期一次性 WS 握手票据 */
export async function fetchChatWsTicket() {
  return apiFetch<WsTicketResponse>('/chat/ws-ticket', { method: 'POST' })
}

export async function fetchChatConversations() {
  return apiFetch<{ conversations: ConversationRow[] }>('/me/chat/conversations')
}

export async function fetchChatMessages(peerPubkey: string, page = 1, pageSize = 50) {
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return apiFetch<{ messages: ChatMessageRow[] }>(
    `/me/chat/${encodeURIComponent(peerPubkey)}/messages?${q.toString()}`,
  )
}

export async function markChatConversationRead(peerPubkey: string) {
  const peer = encodeURIComponent(peerPubkey)
  try {
    return await apiFetch<{ msg: string }>(`/me/chat/${peer}/messages/read`, {
      method: 'POST',
    })
  } catch {
    return apiFetch<{ msg: string }>(`/me/chat/${peer}/read`, {
      method: 'POST',
    })
  }
}
