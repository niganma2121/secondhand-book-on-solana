const STORAGE_KEY = 'book_platform_market_list_refresh_v1'

/** 标记「下次进入书籍市场时应重新拉列表」（例如订单取消后书本应回到在售）。 */
export function requestMarketListRefresh(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // ignore quota / private mode
  }
}

/** 书籍市场页挂载时调用：若存在标记则返回 true 并清除标记。 */
export function consumeMarketListRefreshRequest(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    if (v) {
      sessionStorage.removeItem(STORAGE_KEY)
      return true
    }
  } catch {
    // ignore
  }
  return false
}
