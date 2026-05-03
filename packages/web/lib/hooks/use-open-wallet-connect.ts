'use client'

import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useCallback } from 'react'

/**
 * 打开官方钱包 Modal（WalletModalProvider 已挂载 WalletModal）。
 * 依赖 SolanaProvider 中的 Legacy Adapter，避免零钱包 / 点击无反馈。
 */
export function useOpenWalletConnect() {
  const { setVisible } = useWalletModal()

  return useCallback(() => {
    setVisible(true)
  }, [setVisible])
}
