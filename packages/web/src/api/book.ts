//市场列表查询
import type {BookCard, BookDetail, BookImage} from "../types/book.ts";
import {request} from "./client.ts";

export interface BookFilter {
    page?: number
    page_size?: number
    keyword?: string
    category?: string
    condition?: string
    min_price?: number
    max_price?: number
    sort_by?: 'newest' | 'price_asc' | 'price_desc'
}

export interface CreateBookData {
    name: string;
    author: string;
    category: string;
    condition: string;
    price: number; //传给后端前需转为Lamports
    description: string;
    images: string[]; // 图片URL
}

//获取市场书籍列表
export async function getBooks(filter?: BookFilter): Promise<{ books: BookCard[] }> {
    const params = new URLSearchParams();
    if (filter) {
        Object.entries(filter).forEach(([k, v]) => {
            if (v !== undefined) params.append(k, String(v))
        })
    }
    return request(`/books?${params.toString()}`)
}

//获取书籍详情
export async function getBookDetail(asset: string): Promise<{
    book: BookDetail,
    images: BookImage[]
}> {
    return request(`/books/${asset}`)
}

//上架书籍
export async function createBook(data: CreateBookData): Promise<{ asset: string }> {
    return request('/books', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

export async function getBuyerOrders(): Promise<any[]> {
    return request('/me/orders/buy', {
        method: 'GET'
    });
}

export async function getSellerOrders(): Promise<any[]> {
    return request('/me/orders/sell', {
        method: 'GET'
    });
}

//
export async function getFavorites(): Promise<any[]> {
    return request('/me/favorites', {
        method: 'GET'
    });
}