import type { ChatConversation } from '@/lib/types'

export const chatConversationsFixture: ChatConversation[] = [
  {
    id: '1',
    sellerName: 'Sol读书人',
    sellerAddr: 'Fq3R...kP9x',
    bookTitle: '三体',
    bookCover: '/images/book-1.jpg',
    lastMsg: '可以优惠一点吗？',
    lastTime: '10:32',
    unread: 2,
    messages: [
      { id: 'm1', from: 'seller', text: '你好，这本书九成新，几乎没有使用过', time: '10:20' },
      { id: 'm2', from: 'me', text: '请问可以优惠一点吗？', time: '10:28' },
      { id: 'm3', from: 'seller', text: '已经是最低价了，不过可以包邮给你', time: '10:30' },
      { id: 'm4', from: 'seller', text: '如果今天下单，我马上发货', time: '10:32' },
    ],
  },
  {
    id: '2',
    sellerName: '书海漫游者',
    sellerAddr: 'AR7m...zQ2v',
    bookTitle: '活着',
    bookCover: '/images/book-2.jpg',
    lastMsg: '已经转账，请确认一下',
    lastTime: '昨天',
    unread: 0,
    messages: [
      { id: 'm1', from: 'me', text: '书的状态如何？', time: '昨天 14:10' },
      { id: 'm2', from: 'seller', text: '八成新，有少许翻页痕迹，不影响阅读', time: '昨天 14:15' },
      { id: 'm3', from: 'me', text: '好的，我要了', time: '昨天 14:20' },
      { id: 'm4', from: 'me', text: '已经转账，请确认一下', time: '昨天 14:22' },
    ],
  },
  {
    id: '3',
    sellerName: 'BlockReader',
    sellerAddr: 'KL2p...wN5j',
    bookTitle: '区块链技术指南',
    bookCover: '/images/book-3.jpg',
    lastMsg: '好的，谢谢！',
    lastTime: '周一',
    unread: 1,
    messages: [
      { id: 'm1', from: 'seller', text: '你好，请问还有兴趣购买吗？', time: '周一 09:00' },
      { id: 'm2', from: 'me', text: '好的，谢谢！', time: '周一 09:05' },
    ],
  },
]

/** 移动壳层消息角标（与占位会话同步；接后端后改为接口或 context） */
export function unreadTotalFromFixture(): number {
  return chatConversationsFixture.reduce((n, c) => n + c.unread, 0)
}
