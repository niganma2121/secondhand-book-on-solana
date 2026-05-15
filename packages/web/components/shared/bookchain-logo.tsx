import Image from 'next/image'
import { BOOKCHAIN_LOGO_SRC } from '@/lib/brand'

type BookChainLogoProps = {
  size?: number
  className?: string
  showWordmark?: boolean
  wordmarkClassName?: string
}

/** 顶栏 / 营销页共用的 BookChain 标识 */
export function BookChainLogo({
  size = 28,
  className = '',
  showWordmark = true,
  wordmarkClassName = 'font-bold text-foreground tracking-tight',
}: BookChainLogoProps) {
  return (
    <span className={['inline-flex items-center gap-2 shrink-0', className].filter(Boolean).join(' ')}>
      <Image
        src={BOOKCHAIN_LOGO_SRC}
        alt=""
        width={size}
        height={size}
        className="rounded-lg object-contain"
        priority
      />
      {showWordmark ? (
        <span className={wordmarkClassName}>BookChain</span>
      ) : null}
    </span>
  )
}
