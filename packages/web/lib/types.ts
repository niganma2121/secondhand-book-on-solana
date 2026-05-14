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
  /** 卖家上架时填写的人民币价格 */
  priceCny?: number
  /** 上架时汇率快照：1 SOL ≈ ? CNY */
  fxCnyPerSol?: number
  condition: BookCondition
  category: BookCategory
  seller: string // wallet address
  /** 站内昵称（若有）；展示时与缩写公钥组合 */
  sellerUsername?: string | null
  tokenId: string
  description: string
  listedAt: string
  favorites: number
}

export interface ChainTransaction {
  signature: string
  type: 'buy' | 'sell' | 'list' | 'delist'
  bookTitle: string
  /** 链上/业务侧可返回封面 URL；无则卡片内显示占位 */
  bookCover?: string
  amount: number // SOL
  from: string
  to: string
  timestamp: string
  status: 'confirmed' | 'processing' | 'failed'
  slot: number
  fee: number // lamports
  /** account：Explorer 打开托管 PDA；缺省按链上交易签名处理 */
  transactionLinkKind?: 'account' | 'tx'
}

export interface MyBook {
  id: string
  assetId?: string
  title: string
  author: string
  cover: string
  price: number
  /** 卖家上架时填写的人民币价格（快照） */
  priceCny?: number
  /** 上架时汇率快照：1 SOL ≈ ? CNY */
  fxCnyPerSol?: number
  condition: BookCondition
  category: BookCategory
  tokenId: string
  status: 'listed' | 'sold' | 'owned'
  listedAt: string
  purchasedAt?: string
  purchasePrice?: number
  isCurrentOwner?: boolean
  isOnSale?: boolean
  source?: 'listed' | 'purchased' | 'created'
  /** 仅来自 `/me/books` 时存在：数据库 books.status */
  listingDbStatus?: string
}

export interface ChatMessage {
  id: string
  from: 'me' | 'seller'
  text?: string
  imageUrl?: string
  time: string
  isRead?: boolean
  /** 仅前端展示：收货地址加密提交等卡片样式 */
  variant?: 'address_card'
  meta?: { escrowShort?: string }
}

export interface ChatConversation {
  id: string
  sellerName: string
  sellerAddr: string
  /** 对方站内昵称（若有） */
  peerUsername?: string | null
  /** 对方头像 URL（若有） */
  peerAvatar?: string | null
  bookTitle: string
  bookCover: string
  lastMsg: string
  lastTime: string
  unread: number
  messages: ChatMessage[]
}
