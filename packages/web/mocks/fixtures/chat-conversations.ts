import type { ChatConversation } from '@/lib/types'

/** 占位数据已清空；接后端后会话由接口提供 */
export const chatConversationsFixture: ChatConversation[] = []

export function unreadTotalFromFixture(): number {
  return 0
}
