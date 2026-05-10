'use client'

import { useEffect } from 'react'

/** 居中提示自动关闭时长（毫秒） */
export const LOGIN_REQUIRED_FLASH_MS = 1500

type LoginRequiredFlashProps = {
  open: boolean
  message: string
  onClose: () => void
}

/** 未登录时的居中半透明提示，默认 {@link LOGIN_REQUIRED_FLASH_MS} 后关闭 */
export function LoginRequiredFlash({ open, message, onClose }: LoginRequiredFlashProps) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, LOGIN_REQUIRED_FLASH_MS)
    return () => window.clearTimeout(t)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-6"
      role="alertdialog"
      aria-live="polite"
      onClick={onClose}
    >
      <div
        className="max-w-sm rounded-2xl border border-border bg-card px-8 py-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-semibold text-foreground">{message}</p>
      </div>
    </div>
  )
}
