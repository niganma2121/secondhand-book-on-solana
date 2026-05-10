'use client'

import { Heart } from 'lucide-react'

type MarketFavoriteButtonProps = {
  /** 封面角标：绿色实心；详情顶栏：红心样式 */
  variant: 'card' | 'header'
  favorited: boolean
  isAuthenticated: boolean
  onToggle: () => void
  /** 未登录时调用；可传入详情专用文案 */
  onRequireLogin: (message?: string) => void
}

/**
 * 书籍市场专用收藏按钮：封面右上角与详情顶栏共用逻辑，
 * 未登录时触发 {@link onRequireLogin}（由外层 {@link LoginRequiredFlash} 展示）。
 */
export function MarketFavoriteButton({
  variant,
  favorited,
  isAuthenticated,
  onToggle,
  onRequireLogin,
}: MarketFavoriteButtonProps) {
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isAuthenticated) {
      onRequireLogin(
        variant === 'header' ? '收藏失败，请先登录！' : '请先登录',
      )
      return
    }
    onToggle()
  }

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={favorited ? '取消收藏' : '收藏'}
        aria-pressed={favorited}
        className="absolute top-2 right-2 z-[1] w-7 h-7 rounded-full bg-background/70 backdrop-blur flex items-center justify-center hover:bg-background/90 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 12s-6-3.5-6-7.5A3.5 3.5 0 017 3a3.5 3.5 0 016 1.5C13 8.5 7 12 7 12z"
            stroke={favorited ? '#4ade80' : 'currentColor'}
            fill={favorited ? '#4ade80' : 'none'}
            strokeWidth="1.3"
            className={favorited ? '' : 'text-muted-foreground'}
          />
        </svg>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={favorited ? '取消收藏' : '收藏'}
      aria-pressed={favorited}
      className={[
        'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        favorited
          ? 'text-red-500 hover:bg-red-500/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
      ].join(' ')}
    >
      <Heart className="h-5 w-5" fill={favorited ? 'currentColor' : 'none'} strokeWidth={1.75} />
    </button>
  )
}
