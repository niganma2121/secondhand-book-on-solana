import type { Conversation } from "@/types"
import { fixtureBooks } from "./books.fixture"
import { fixtureUserPrimary, fixtureUserSecondary } from "./users.fixture"

export const fixtureConversations: Conversation[] = [
    {
        id: "1",
        participant: fixtureUserPrimary,
        lastMessage: {
            id: "m1",
            from: fixtureUserPrimary,
            to: fixtureUserPrimary,
            content: "请问这本书还在吗？",
            createdAt: "2024-03-15T10:30:00",
            read: false,
            bookRef: fixtureBooks[0],
        },
        unreadCount: 2,
        bookRef: fixtureBooks[0],
    },
    {
        id: "2",
        participant: fixtureUserSecondary,
        lastMessage: {
            id: "m2",
            from: fixtureUserPrimary,
            to: fixtureUserPrimary,
            content: "好的，我明天去取",
            createdAt: "2024-03-14T16:20:00",
            read: true,
        },
        unreadCount: 0,
    },
]
