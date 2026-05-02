import type { Order } from "@/types"
import { fixtureBooks } from "./books.fixture"

export const fixtureOrders: Order[] = [
    {
        id: "ORD-001",
        book: fixtureBooks[0],
        buyer: fixtureBooks[0].seller,
        seller: fixtureBooks[0].seller,
        price: fixtureBooks[0].price,
        status: "shipped",
        txHash: "0xabc123def456",
        createdAt: "2024-03-15",
        updatedAt: "2024-03-16",
    },
    {
        id: "ORD-002",
        book: fixtureBooks[1],
        buyer: fixtureBooks[1].seller,
        seller: fixtureBooks[1].seller,
        price: fixtureBooks[1].price,
        status: "completed",
        txHash: "0xdef789abc012",
        createdAt: "2024-03-10",
        updatedAt: "2024-03-12",
    },
]
