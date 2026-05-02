import type { User } from "@/types"

/** 本地开发占位用户 — 仅 fixtures / 开发开关使用，不接后端时不要混进业务组件以外的逻辑 */
export const fixtureUserPrimary: User = {
    id: "1",
    address: "0x1234...abcd",
    nickname: "书虫小王",
    avatar: "",
    school: "北京大学",
    rating: 4.8,
    listingsCount: 12,
    soldCount: 8,
}

export const fixtureUserSecondary: User = {
    ...fixtureUserPrimary,
    id: "2",
    nickname: "学霸小李",
    address: "0xAABB...1234",
}
