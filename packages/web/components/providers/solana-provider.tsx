'use client'

import { createSolanaClient } from '@metamask/connect-solana'
import { useEffect, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomMobileFriendlyWalletAdapter } from '@/lib/wallet/phantom-mobile-friendly-adapter'
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
   * MetaMask（Solana）：通过 Wallet Standard 注册，连接弹窗里会出现 MetaMask 选项。
   * @see https://docs.metamask.io/metamask-connect/solana/guides/use-wallet-adapter/
   */
  useEffect(() => {
    void createSolanaClient({
      dapp: {
        name: 'Bookchain',
        url: window.location.origin,
      },
      api: {
        supportedNetworks: {
          devnet: endpoint,
        },
      },
    })
  }, [endpoint])

  /**
   * Phantom 使用带移动端 Universal Link 的适配器；MetaMask（Solana）由 createSolanaClient 注册。
   */
  const wallets = useMemo(() => [new PhantomMobileFriendlyWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
