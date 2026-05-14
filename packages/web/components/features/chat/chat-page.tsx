'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { routes, userPublicProfile } from '@/config/routes'
import type { ChatConversation, ChatMessage } from '@/lib/types'
import { useChatConversationsContext } from '@/components/providers/chat-conversations-provider'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { tryNormalizeSolanaPubkey } from '@/lib/solana-pubkey'
import { privacyPubkey } from '@/lib/format-seller'
import { ChatMessageBody } from '@/components/features/chat/chat-message-body'

function ChatPeerAvatar({
  avatarUrl,
  title,
  className,
}: {
  avatarUrl?: string | null
  title: string
  className?: string
}) {
  const initial = Array.from((title || '?').trim() || '?')[0] ?? '?'
  if (avatarUrl) {
    return (
      <div className={['relative overflow-hidden bg-secondary', className].filter(Boolean).join(' ')}>
        <Image src={avatarUrl} alt="" fill className="object-cover" sizes="64px" unoptimized />
      </div>
    )
  }
  return (
    <div
      className={[
        'flex items-center justify-center bg-secondary text-primary font-bold',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="leading-none select-none">{initial}</span>
    </div>
  )
}

type ChatPageProps = {
  /** 从 `/chat?peer=...` 进入时自动打开与该地址的会话 */
  initialPeerQuery?: string
}

export function ChatPage({ initialPeerQuery }: ChatPageProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<ChatConversation | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newPeerInput, setNewPeerInput] = useState('')
  const [newPeerError, setNewPeerError] = useState<string | null>(null)
  const peerFromUrlHandled = useRef<string | undefined>(undefined)
  const { isAuthenticated, user } = useAuth()
  const {
    conversations,
    setConversations,
    usingBackend,
    sendChatText,
    ensurePeerMessagesLoaded,
    markConversationReadNow,
    clearActiveConversation,
    openConversationWithPeer,
    wsConnected,
    wsError,
    clearWsError,
    loadingList,
  } = useChatConversationsContext()
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const activeConversation = selected
    ? (conversations.find((c) => c.id === selected.id) ?? selected)
    : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.id, activeConversation?.messages.length])

  useEffect(() => {
    if (selected && usingBackend && isAuthenticated) {
      void ensurePeerMessagesLoaded(selected.sellerAddr)
      void markConversationReadNow(selected.sellerAddr)
    }
  }, [
    selected?.sellerAddr,
    usingBackend,
    isAuthenticated,
    ensurePeerMessagesLoaded,
    markConversationReadNow,
  ])

  useEffect(() => {
    if (!selected || !usingBackend || !isAuthenticated) return
    const timer = window.setInterval(() => {
      void ensurePeerMessagesLoaded(selected.sellerAddr)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [selected?.sellerAddr, usingBackend, isAuthenticated, ensurePeerMessagesLoaded])

  useEffect(() => {
    if (selected) return
    clearActiveConversation()
  }, [selected, clearActiveConversation])

  useEffect(() => {
    if (!initialPeerQuery) {
      peerFromUrlHandled.current = undefined
      return
    }
    if (!usingBackend || !isAuthenticated || !user) return
    if (peerFromUrlHandled.current === initialPeerQuery) return
    const conv = openConversationWithPeer(initialPeerQuery)
    if (conv) {
      setSelected(conv)
      peerFromUrlHandled.current = initialPeerQuery
    }
  }, [
    initialPeerQuery,
    usingBackend,
    isAuthenticated,
    user,
    openConversationWithPeer,
  ])

  function submitNewPeer() {
    setNewPeerError(null)
    if (!user) return
    const pk = tryNormalizeSolanaPubkey(newPeerInput)
    if (!pk) {
      setNewPeerError('请输入有效的 Solana 地址（Base58）')
      return
    }
    if (pk === user.pubkey) {
      setNewPeerError('不能与自己发起会话')
      return
    }
    const conv = openConversationWithPeer(pk)
    if (conv) {
      setSelected(conv)
      setNewChatOpen(false)
      setNewPeerInput('')
    }
  }

  // 自动调整 textarea 高度
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 112) + 'px'
    setInputVal(el.value)
  }

  function sendMessageLocal(text?: string, imageUrl?: string) {
    if ((!text?.trim() && !imageUrl) || !selected) return
    const newMsg: ChatMessage = {
      id: `m${Date.now()}`,
      from: 'me',
      text: text?.trim(),
      imageUrl,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
    }
    const snippet = imageUrl ? '[图片]' : (text?.trim() ?? '')
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, messages: [...c.messages, newMsg], lastMsg: snippet, lastTime: '刚刚', unread: 0 }
          : c
      )
    )
    setSelected((prev) => (prev ? { ...prev, messages: [...prev.messages, newMsg] } : prev))
    setInputVal('')
    setImagePreview(null)
  }

  function handleSend() {
    if (!selected) return
    if (usingBackend) {
      if (imagePreview) return
      const t = inputVal.trim()
      if (!t) return
      sendChatText(selected.sellerAddr, t)
      setInputVal('')
      return
    }
    if (imagePreview) {
      sendMessageLocal(inputVal || undefined, imagePreview)
    } else {
      sendMessageLocal(inputVal)
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── 对话详情 ─────────────────────────────────────────────────
  if (selected) {
    const conv = activeConversation
    if (!conv) {
      return null
    }

    return (
      // 关键：外层固定高度，内部 flex-col，消息区 flex-1 min-h-0 overflow-y-auto，输入区 shrink-0
      <div className="fixed inset-0 z-[60] bg-background flex flex-col md:relative md:inset-auto md:z-auto md:h-[calc(100vh-64px)]">

        {/* 顶栏 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-card/80 backdrop-blur-md shrink-0">
          <button
            onClick={() => {
              setSelected(null)
              clearActiveConversation()
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
            aria-label="返回列表"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link
            href={userPublicProfile(conv.sellerAddr)}
            className="flex items-center gap-3 flex-1 min-w-0 rounded-xl pr-1 -m-1 p-1 hover:bg-secondary/40 transition-colors"
          >
            <ChatPeerAvatar
              avatarUrl={conv.peerAvatar}
              title={conv.sellerName}
              className="w-9 h-9 rounded-xl shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{conv.sellerName}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{privacyPubkey(conv.sellerAddr)}</p>
            </div>
          </Link>
          <div className="flex flex-col gap-1.5 items-end shrink-0">
            <Link
              href={`${routes.market}?seller=${encodeURIComponent(conv.sellerAddr)}`}
              className="text-xs text-primary border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={(e) => {
                e.preventDefault()
                router.push(`${routes.market}?seller=${encodeURIComponent(conv.sellerAddr)}`)
              }}
            >
              查看Ta在售书籍
            </Link>
          </div>
        </div>

        {/* 书目信息条 */}
        <div className="flex items-center gap-2 px-4 py-2 bg-secondary/30 border-b border-border/40 shrink-0">
          <span className="text-[10px] text-muted-foreground">洽谈书目：</span>
          <span className="text-xs text-foreground font-medium">{conv.bookTitle}</span>
        </div>

        {/* 消息列表 — flex-1 + min-h-0 确保可滚动且不撑开父容器 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {conv.messages.map((msg) => (
            <div
              key={msg.id}
              className={['flex gap-2.5', msg.from === 'me' ? 'flex-row-reverse' : ''].join(' ')}
            >
              {msg.from === 'seller' && (
                <Link
                  href={userPublicProfile(conv.sellerAddr)}
                  className="shrink-0 mt-0.5 rounded-lg overflow-hidden ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="查看对方资料"
                >
                  <ChatPeerAvatar
                    avatarUrl={conv.peerAvatar}
                    title={conv.sellerName}
                    className="w-7 h-7 rounded-lg"
                  />
                </Link>
              )}
              <div className="max-w-[72%]">
                <div
                  className={[
                    msg.imageUrl
                      ? 'rounded-2xl overflow-hidden border border-border/40'
                      : 'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                    msg.from === 'me'
                      ? msg.imageUrl
                        ? 'rounded-tr-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm'
                      : msg.imageUrl
                        ? 'rounded-tl-sm'
                        : 'bg-card border border-border/60 text-foreground rounded-tl-sm',
                  ].join(' ')}
                >
                  {msg.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.imageUrl}
                      alt="图片消息"
                      className="max-w-[220px] max-h-[280px] object-cover block"
                    />
                  ) : (
                    <ChatMessageBody
                      text={msg.text ?? ''}
                      variant={msg.from === 'me' ? 'me' : 'peer'}
                    />
                  )}
                  {msg.imageUrl && msg.text && (
                    <p
                      className={[
                        'text-sm px-3 py-2',
                        msg.from === 'me' ? 'text-primary-foreground bg-primary' : 'text-foreground',
                      ].join(' ')}
                    >
                      <ChatMessageBody
                        text={msg.text}
                        variant={msg.from === 'me' ? 'me' : 'peer'}
                      />
                    </p>
                  )}
                </div>
              </div>
              <div
                className={[
                  'shrink-0 self-end pb-1 text-[10px]',
                  msg.from === 'seller' ? (msg.isRead ? 'text-muted-foreground' : 'text-primary') : '',
                  msg.from === 'seller' ? 'text-left' : '',
                ].join(' ')}
              >
                {msg.from === 'seller' ? (msg.isRead ? '已读' : '未读') : null}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* 图片预览条 — shrink-0 固定，不参与滚动 */}
        {imagePreview && (
          <div className="flex px-4 py-2 border-t border-border/40 bg-card/60 backdrop-blur-sm shrink-0 items-center gap-3">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-border/60 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="待发图片" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs text-muted-foreground flex-1">图片已准备，可附加文字后发送</span>
            <button
              onClick={() => setImagePreview(null)}
              className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center hover:bg-border transition-colors"
              aria-label="取消图片"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* 输入区 — shrink-0 固定在底部，所有端统一显示 */}
        <div
          className="flex items-end gap-2 px-4 py-3 border-t border-border/60 bg-card/80 backdrop-blur-md shrink-0"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* 图片上传 */}
          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            className="w-10 h-10 rounded-xl bg-secondary border border-border/50 flex items-center justify-center shrink-0 hover:border-primary/40 transition-colors active:scale-95 mb-0.5"
            aria-label="发送图片"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-muted-foreground">
              <rect x="2" y="4" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="7" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 14l4.5-4 3 3 2.5-2.5L16 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleImageChange}
          />

          {/* Textarea — 自动撑高，最大 112px（约 4 行） */}
          <textarea
            rows={1}
            value={inputVal}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={imagePreview ? '添加文字描述（可选）...' : '发送消息...'}
            className="flex-1 bg-secondary/60 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground border border-border/40 focus:outline-none focus:border-primary/50 transition-colors resize-none leading-relaxed overflow-y-auto"
            style={{ height: '40px', maxHeight: '112px' }}
          />

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={
              (!inputVal.trim() && !imagePreview) || (Boolean(usingBackend) && Boolean(imagePreview))
            }
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-40 transition-all duration-150 active:scale-95 mb-0.5"
            aria-label="发送"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M15.5 9L2.5 3.5l2.5 5.5-2.5 5.5L15.5 9z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // ── 会话列表 ─────────────────────────────────────────────────
  return (
    <div className="pb-28 md:pb-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5">
        {usingBackend && (
          <div className="mb-3 space-y-1">
            {loadingList && (
              <p className="text-xs text-muted-foreground">正在加载会话…</p>
            )}
            {wsError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/10 px-2.5 py-2">
                <p className="text-xs text-destructive flex-1 min-w-0 leading-snug">{wsError}</p>
                <button
                  type="button"
                  className="text-[11px] shrink-0 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => clearWsError()}
                >
                  清除
                </button>
              </div>
            )}
            {!wsError && isAuthenticated && !wsConnected && (
              <p className="text-xs text-muted-foreground">正在连接实时聊天…</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mb-4 gap-3">
          <h1 className="text-xl font-bold text-foreground">消息</h1>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {isAuthenticated &&
            typeof globalThis !== 'undefined' &&
            typeof globalThis.Notification !== 'undefined' &&
            globalThis.Notification.permission === 'default' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs h-8 px-2 text-muted-foreground"
                onClick={() => {
                  void globalThis.Notification.requestPermission()
                }}
              >
                开启桌面通知
              </Button>
            ) : null}
            {isAuthenticated && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs h-8"
                onClick={() => {
                  setNewPeerError(null)
                  setNewChatOpen(true)
                }}
              >
                新对话
              </Button>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {conversations.reduce((n, c) => n + c.unread, 0)} 条未读
            </span>
          </div>
        </div>

        <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>发起会话</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              输入对方的 Solana 钱包地址（完整 Base58），双方在线且已登录后即可实时收发。
            </p>
            <Input
              placeholder="例如 7xKX…"
              value={newPeerInput}
              onChange={(e) => setNewPeerInput(e.target.value)}
              className="font-mono text-sm"
            />
            {newPeerError && (
              <p className="text-xs text-destructive">{newPeerError}</p>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" type="button" onClick={() => setNewChatOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => void submitNewPeer()}>
                开始聊天
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="relative mb-4">
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="搜索会话..."
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setSelected(conv)
                void markConversationReadNow(conv.sellerAddr)
              }}
              className="flex items-center gap-3 p-3.5 bg-card border border-border/50 rounded-2xl hover:border-primary/30 transition-all duration-150 text-left active:scale-[0.99]"
            >
              <div className="relative shrink-0">
                <Link
                  href={userPublicProfile(conv.sellerAddr)}
                  onClick={(e) => e.stopPropagation()}
                  className="block rounded-2xl overflow-hidden ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="查看对方资料"
                >
                  <ChatPeerAvatar
                    avatarUrl={conv.peerAvatar}
                    title={conv.sellerName}
                    className="w-11 h-11 rounded-2xl"
                  />
                </Link>
                {conv.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-primary flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary-foreground leading-none">{conv.unread}</span>
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-foreground truncate">{conv.sellerName}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{conv.lastTime}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{conv.bookTitle} · {conv.lastMsg}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-muted-foreground shrink-0">
                <path d="M5 3.5L8.5 7 5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <path
                d="M5 9A4 4 0 019 5h22a4 4 0 014 4v14a4 4 0 01-4 4H22l-7 6v-6H9a4 4 0 01-4-4V9z"
                stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity="0.06"
              />
            </svg>
            <p className="text-sm">暂无会话：可输入对方钱包发起聊天，或从市场联系卖家</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {isAuthenticated && (
                <Button
                  variant="default"
                  className="rounded-xl text-sm"
                  onClick={() => {
                    setNewPeerError(null)
                    setNewChatOpen(true)
                  }}
                >
                  发起会话
                </Button>
              )}
              <Button asChild variant="outline" className="rounded-xl border-border/60 text-sm">
                <Link href={routes.market}>逛书市</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
