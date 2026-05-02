// 收藏列表
import {request} from "./client.ts";
import type {BookCard} from "../types/book.ts";
import type {Escrow} from "../types/escrow.ts";

export async function getFavorites(page = 1): Promise<{ books: BookCard[] }> {
    return request(`/me/favorites?page=${page}`)
}

// 添加/取消收藏
export async function toggleFavorite(asset: string): Promise<{ favorited: boolean }> {
    return request(`/me/favorites/${asset}`, {method: 'POST'})
}

// 买家订单列表
export async function getBuyerOrders(page = 1): Promise<{ orders: Escrow[] }> {
    return request(`/me/orders/buying?page=${page}`)
}

// 卖家订单列表
export async function getSellerOrders(page = 1): Promise<{ orders: Escrow[] }> {
    return request(`/me/orders/selling?page=${page}`)
}

// 买过的书
export async function getBoughtBooks(page = 1): Promise<{ books: BookCard[] }> {
    return request(`/me/bought?page=${page}`)
}

// 提交评价
export async function submitReview(data: {
    escrow_pda: string
    reviewee: string
    score: number
    comment?: string
}): Promise<{ msg: string }> {
    return request('/me/reviews', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}