import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {AlphaWalletAdapter, PhantomWalletAdapter} from '@solana/wallet-adapter-wallets'
import '@solana/wallet-adapter-react-ui/styles.css'
import '@fontsource-variable/geist'
import './index.css'
import App from './App'
import {AuthProvider} from "./store/auth.tsx";
import { Buffer } from 'buffer';
window.Buffer = Buffer;
(window as any).global = window;
import '@fontsource-variable/geist-mono'


const endpoint = 'https://api.devnet.solana.com'
const wallets = [new PhantomWalletAdapter(),new AlphaWalletAdapter()]

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <AuthProvider>
                        <App />
                    </AuthProvider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    </StrictMode>
)