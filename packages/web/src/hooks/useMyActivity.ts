import { useState, useEffect } from "react";
import { getBuyerOrders, getSellerOrders, getFavorites } from "../api/book"; // 假设已在 api/book.ts 定义
import type { Escrow } from "../types/escrow.ts";
import type { BookCard } from "../types/book.ts";

export function useMyActivity() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        buyOrders: Escrow[],
        sellOrders: Escrow[],
        favorites: BookCard[]
    }>({ buyOrders: [], sellOrders: [], favorites: [] });

    useEffect(() => {
        async function fetchAll() {
            setLoading(true);
            try {
                // 并发获取数据，提高生产环境响应速度
                const [buys, sells, favs] = await Promise.all([
                    getBuyerOrders(),
                    getSellerOrders(),
                    getFavorites()
                ]);
                setData({ buyOrders: buys, sellOrders: sells, favorites: favs });
            } catch (err) {
                console.error("加载个人活动数据失败", err);
            } finally {
                setLoading(false);
            }
        }
        fetchAll();
    }, []);

    return { ...data, loading };
}