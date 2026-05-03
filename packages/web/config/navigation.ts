import { routes } from '@/config/routes'

/** 桌面端顶栏：含「我的书架」 */
export const desktopNavItems = [
  { label: '首页', href: routes.home },
  { label: '书籍市场', href: routes.market },
  { label: '链上记录', href: routes.transactions },
  { label: '我的书架', href: routes.shelf },
  { label: '上架书籍', href: routes.list },
  { label: '消息', href: routes.chat },
  { label: '我的', href: routes.profile },
] as const

/**
 * 移动端底栏：5 项 + 中心上架；「书架」由个人页/首页进入
 * href 与 routes 对齐，用于 pathname 高亮
 */
export const mobileNavItems = [
  { label: '首页', href: routes.home, navKey: 'home' as const },
  { label: '市场', href: routes.market, navKey: 'market' as const },
  { label: '上架', href: routes.list, navKey: 'list' as const, isCenter: true as const },
  { label: '记录', href: routes.transactions, navKey: 'transactions' as const },
  { label: '我的', href: routes.profile, navKey: 'profile' as const },
] as const
