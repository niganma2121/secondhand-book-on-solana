'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** 与上架页「详情图大图预览」同款：透明底、大图居中，点击缩略图打开 */
export function ImageLightboxDialog({
  open,
  onOpenChange,
  url,
  title = '图片预览',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  title?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(98vw,1280px)] border-0 bg-transparent p-2 shadow-none sm:max-w-6xl [&>button]:text-white [&>button]:drop-shadow-md"
        showCloseButton
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>查看原图</DialogDescription>
        </DialogHeader>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="w-full max-h-[min(92vh,960px)] object-contain rounded-lg mx-auto bg-black/25"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
