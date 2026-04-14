import { useMemo } from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// 导入布局和页面
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/home";

// 必须引入钱包适配器的官方样式，否则弹窗是乱码/透明的
import '@solana/wallet-adapter-react-ui/styles.css';

export default function App() {
    // 1. 配置 Solana 网络环境
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const wallets = useMemo(() => [], []); // 留空，适配器会自动识别已安装的插件

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {/* 2. 配置路由系统 */}
                    <BrowserRouter>
                        <Routes>
                            {/* 外层包裹布局，这样所有子页面都有底部的 Tabbar */}
                            <Route element={<MainLayout />}>
                                <Route path="/" element={<Home />} />

                                {/* 占位页面：你可以先在这里写简单的 div，等后续建好文件夹再换掉 */}
                                <Route path="/chat" element={<div className="p-10">消息列表（开发中...）</div>} />
                                <Route path="/publish" element={<div className="p-10">发布二手书（开发中...）</div>} />
                                <Route path="/profile" element={<div className="p-10">个人中心（已连接钱包）</div>} />
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}