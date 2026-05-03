export type BookCondition = '全新' | '近全新' | '良好' | '一般' | '较差'

export type BookCategory =
  | '文学小说'
  | '科学技术'
  | '历史文化'
  | '艺术设计'
  | '教育学习'
  | '商业经济'
  | '科幻奇幻'
  | '其他'

export interface Book {
  id: string
  title: string
  author: string
  cover: string
  price: number // SOL
  condition: BookCondition
  category: BookCategory
  seller: string // wallet address
  tokenId: string
  description: string
  listedAt: string
  favorites: number
}

export interface ChainTransaction {
  signature: string
  type: 'buy' | 'sell' | 'list' | 'delist'
  bookTitle: string
  amount: number // SOL
  from: string
  to: string
  timestamp: string
  status: 'confirmed' | 'processing' | 'failed'
  slot: number
  fee: number // lamports
}

export interface MyBook {
  id: string
  title: string
  author: string
  cover: string
  price: number
  condition: BookCondition
  category: BookCategory
  tokenId: string
  status: 'listed' | 'sold' | 'owned'
  listedAt: string
  purchasedAt?: string
  purchasePrice?: number
}

export interface ChatMessage {
  id: string
  from: 'me' | 'seller'
  text?: string
  imageUrl?: string
  time: string
}

export interface ChatConversation {
  id: string
  sellerName: string
  sellerAddr: string
  bookTitle: string
  bookCover: string
  lastMsg: string
  lastTime: string
  unread: number
  messages: ChatMessage[]
}
