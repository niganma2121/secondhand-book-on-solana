// 书籍状态
export type BookStatus = "available" | "sold" | "reserved"

// 书籍
export interface Book {
    id: string
    title: string
    author: string
    publisher: string
    isbn?: string
    price: number          // 单位：ETH,,后面再修改为人民币兑换
    originalPrice: number
    condition: "new" | "like_new" | "good" | "fair"
    description: string
    images: string[]
    category: string
    status: BookStatus
    seller: User
    createdAt: string
    isFavorited?: boolean
}

// 用户
export interface User {
    id: string
    address: string
    nickname?: string
    avatar?: string
    school?: string
    rating: number
    listingsCount: number
    soldCount: number
}

// 订单
export type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "cancelled"

export interface Order {
    id: string
    book: Book
    buyer: User
    seller: User
    price: number
    status: OrderStatus
    txHash?: string        // 链上交易hash
    createdAt: string
    updatedAt: string
}

// 消息
export interface Message {
    id: string
    from: User
    to: User
    content: string
    createdAt: string
    read: boolean
    bookRef?: Book         // 关联的书籍
}

// 聊天会话
export interface Conversation {
    id: string
    participant: User
    lastMessage: Message
    unreadCount: number
    bookRef?: Book
}

// 钱包状态
export interface WalletState {
    address: string | null
    isConnected: boolean
    chainId?: number
    balance?: string
}

// 筛选参数
export interface BookFilter {
    keyword?: string
    category?: string
    minPrice?: number
    maxPrice?: number
    condition?: Book["condition"]
    sortBy?: "price_asc" | "price_desc" | "newest"
}