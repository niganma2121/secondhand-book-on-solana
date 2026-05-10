'use client'

import type { ComponentProps, MouseEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type BaseLoginGatedProps = {
  isAuthenticated: boolean
  onRequireLogin: (message?: string) => void
  /** 未登录提示文案，默认「请先登录」 */
  loginMessage?: string
  children: React.ReactNode
  /** 卡片内点击需阻止冒泡到整条卡片 */
  stopPropagation?: boolean
}

type LoginGatedLinkProps = BaseLoginGatedProps & {
  href: string
  onAuthedClick?: never
  className: string
  /**
   * shadcn：外层 Button + Link（卡片「联系卖家」）
   * inline：与详情页原先 Link 同款样式，仅替换为 button / Link（登录门控）
   */
  linkVariant?: 'shadcn' | 'inline'
  size?: ComponentProps<typeof Button>['size']
}

type LoginGatedClickProps = BaseLoginGatedProps & {
  href?: never
  linkVariant?: never
  onAuthedClick: () => void
  className?: string
  size?: ComponentProps<typeof Button>['size']
}

export type MarketLoginGatedActionProps = LoginGatedLinkProps | LoginGatedClickProps

function wrapStop(e: MouseEvent, stopPropagation: boolean) {
  if (stopPropagation) e.stopPropagation()
}

/**
 * 市场页需要登录才可继续的操作：未登录统一 1.5s 居中提示（由页面传入 onRequireLogin）。
 * - 传入 `href`：登录后走 Next Link；未登录点击不跳转。
 * - 传入 `onAuthedClick`：登录后执行回调（如打开购买流程）。
 */
export function MarketLoginGatedAction(props: MarketLoginGatedActionProps) {
  const loginMessage = props.loginMessage ?? '请先登录'
  const stopPropagation = props.stopPropagation ?? false

  const showLogin = (e: MouseEvent<HTMLButtonElement>) => {
    wrapStop(e, stopPropagation)
    e.preventDefault()
    props.onRequireLogin(loginMessage)
  }

  if ('href' in props && props.href) {
    const {
      href,
      className,
      children,
      isAuthenticated,
      linkVariant = 'shadcn',
      size = 'sm',
    } = props

    if (linkVariant === 'inline') {
      if (!isAuthenticated) {
        return (
          <button type="button" className={className} onClick={showLogin}>
            {children}
          </button>
        )
      }
      return (
        <Link href={href} className={className} onClick={(e) => wrapStop(e, stopPropagation)}>
          {children}
        </Link>
      )
    }

    if (!isAuthenticated) {
      return (
        <Button type="button" size={size} className={className} onClick={showLogin}>
          {children}
        </Button>
      )
    }
    return (
      <Button asChild size={size} className={className}>
        <Link href={href} onClick={(e) => wrapStop(e, stopPropagation)}>
          {children}
        </Link>
      </Button>
    )
  }

  const click = props as LoginGatedClickProps
  const { onAuthedClick, className, children, isAuthenticated, size = 'sm' } = click

  return (
    <Button
      type="button"
      size={size}
      className={className}
      onClick={(e) => {
        wrapStop(e, stopPropagation)
        if (!isAuthenticated) {
          click.onRequireLogin(loginMessage)
          return
        }
        onAuthedClick()
      }}
    >
      {children}
    </Button>
  )
}
