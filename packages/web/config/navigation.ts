import { routes } from '@/config/routes'

/* 桌面端顶栏 */
export const desktopNavItems = [
  { label: '首页', href: routes.home },
  { label: '书籍市场', href: routes.market },
  { label: '订单', href: routes.pending },
  { label: '链上记录', href: routes.transactions },
  { label: '我的书架', href: routes.shelf },
  { label: '上架书籍', href: routes.list },
  { label: '消息', href: routes.chat },
  { label: '我的', href: routes.profile },
] as const

/*移动端底栏*/
export const mobileNavItems = [
  { label: '首页', href: routes.home, navKey: 'home' as const },
  { label: '市场', href: routes.market, navKey: 'market' as const },
  { label: '上架', href: routes.list, navKey: 'list' as const, isCenter: true as const },
  { label: '订单', href: routes.pending, navKey: 'pending' as const },
  { label: '我的', href: routes.profile, navKey: 'profile' as const },
] as const
