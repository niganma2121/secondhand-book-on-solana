/**
 * 开发用占位数据集中出口。
 * 页面组件只引用这里的导出或后续 API 层；不要把大块字面量写在 TSX 里。
 */
export { fixtureUserPrimary, fixtureUserSecondary } from "./users.fixture"
export { fixtureBooks } from "./books.fixture"
export { fixtureCategories } from "./categories.fixture"
export { fixtureConversations } from "./conversations.fixture"
export { fixtureOrders } from "./orders.fixture"
export { fixtureHomeHeroStats } from "./home.fixture"
export { fixtureWalletDevDisplay } from "./wallet.fixture"

/** @deprecated 逐步改为 fixture* 命名 */
export { fixtureUserPrimary as mockUser } from "./users.fixture"
export { fixtureUserSecondary as mockUserAlt } from "./users.fixture"
export { fixtureBooks as mockBooks } from "./books.fixture"
export { fixtureCategories as categories } from "./categories.fixture"
export { fixtureConversations as mockConversations } from "./conversations.fixture"
export { fixtureOrders as mockOrders } from "./orders.fixture"
