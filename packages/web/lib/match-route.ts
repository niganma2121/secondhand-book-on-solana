import { routes } from '@/config/routes'

export function isNavActive(pathname: string, href: string): boolean {
  if (href === routes.home) {
    return pathname === '/'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
