import { ChatPage } from '@/components/features/chat/chat-page'

export default async function ChatRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ peer?: string | string[] }>
}) {
  const sp = await searchParams
  const peer = typeof sp.peer === 'string' ? sp.peer : undefined
  return <ChatPage initialPeerQuery={peer} />
}
