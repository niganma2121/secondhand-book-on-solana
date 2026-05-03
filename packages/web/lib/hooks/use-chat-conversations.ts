'use client'

import { useMemo, useState } from 'react'
import type { ChatConversation } from '@/lib/types'
import { chatConversationsFixture } from '@/mocks/fixtures/chat-conversations'

function cloneConversations(source: ChatConversation[]): ChatConversation[] {
  return source.map((c) => ({
    ...c,
    messages: c.messages.map((m) => ({ ...m })),
  }))
}

/**
 * 会话占位：后续替换为 WebSocket / SSE + JWT，与 Axum 对齐
 */
export function useChatConversations() {
  const initial = useMemo(() => cloneConversations(chatConversationsFixture), [])
  const [conversations, setConversations] = useState<ChatConversation[]>(initial)

  return { conversations, setConversations }
}
