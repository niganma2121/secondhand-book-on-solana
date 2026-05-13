'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useChatConversations } from '@/lib/hooks/use-chat-conversations'

type ChatConversationsContextValue = ReturnType<typeof useChatConversations>

const ChatConversationsContext = createContext<ChatConversationsContextValue | null>(null)

export function ChatConversationsProvider({ children }: { children: ReactNode }) {
  const value = useChatConversations()
  return (
    <ChatConversationsContext.Provider value={value}>{children}</ChatConversationsContext.Provider>
  )
}

export function useChatConversationsContext(): ChatConversationsContextValue {
  const ctx = useContext(ChatConversationsContext)
  if (!ctx) {
    throw new Error('useChatConversationsContext 必须在 ChatConversationsProvider 内使用')
  }
  return ctx
}
