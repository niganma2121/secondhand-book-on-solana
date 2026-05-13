'use client'

import type { ReactNode } from 'react'
import { DesktopHeader } from '@/components/layout/desktop-header'
import { MobileHeader } from '@/components/layout/mobile-header'
import { MobileTabBar } from '@/components/layout/mobile-tab-bar'
import { ChatConversationsProvider } from '@/components/providers/chat-conversations-provider'
import { OrderAttentionProvider } from '@/components/providers/order-attention-provider'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ChatConversationsProvider>
      <OrderAttentionProvider>
        <div className="min-h-[100dvh] flex flex-col bg-background">
          <MobileHeader />
          <DesktopHeader />
          {/* 移动端为底栏预留空间：pb 与 components/layout/mobile-tab-bar 高度对齐 */}
          <main className="flex-1 w-full pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
          <MobileTabBar />
        </div>
      </OrderAttentionProvider>
    </ChatConversationsProvider>
  )
}
