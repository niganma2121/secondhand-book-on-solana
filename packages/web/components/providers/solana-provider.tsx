'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// 引入官方 modal 样式
import '@solana/wallet-adapter-react-ui/styles.css'

/**
 * 必须为 true：`WalletModal` 里选钱包只执行 `select()`，真正拉起扩展授权依赖 Provider 的 auto-connect 逻辑去调 `adapter.connect()`。
 * 设为 false 时选完钱包永远不会 connect，表现为无弹窗、地址一直是「连接钱包」。
 * 若不希望刷新后自动重连，可在钱包菜单断开或清理站点 localStorage（键名多为 `walletName`）。
 */
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  // Devnet 节点
  const endpoint = useMemo(() => clusterApiUrl('devnet'), [])

  /**
   * 显式挂上 Solflare Legacy Adapter。
   * Phantom 已支持 Wallet Standard 自动发现，避免重复注册提示，不再显式注入 Phantom adapter。
   * WalletProvider 会与 Standard 发现结果合并，同名一般会去重。
   */
  const wallets = useMemo(
    () => [new SolflareWalletAdapter()],
    [],
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
