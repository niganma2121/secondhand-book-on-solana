'use client'

import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'

function isLikelyMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )
}

function isPhantomInjected(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & {
    phantom?: { solana?: { isPhantom?: boolean } }
    solana?: { isPhantom?: boolean }
  }
  return Boolean(w.phantom?.solana?.isPhantom || w.solana?.isPhantom)
}

/**
 * 官方 Phantom 适配器仅在 iOS Safari 将状态设为 Loadable，并用 phantom.app/ul/browse 跳转；
 * Android / 移动 Chrome / Edge 等通常没有扩展注入，状态停在 NotDetected，点击连接会直接失败。
 * 在无 Phantom 注入的移动浏览器上统一使用同一 Universal Link，由系统在已安装的 Phantom App 内打开当前页。
 */
export class PhantomMobileFriendlyWalletAdapter extends PhantomWalletAdapter {
  override async connect(): Promise<void> {
    if (typeof window === 'undefined') {
      await super.connect()
      return
    }
    if (this.connected || this.connecting) return

    if (!isPhantomInjected() && isLikelyMobileBrowser()) {
      const url = encodeURIComponent(window.location.href)
      const ref = encodeURIComponent(window.location.origin)
      window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`
      return
    }

    await super.connect()
  }
}
