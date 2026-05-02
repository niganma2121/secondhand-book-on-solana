import {useWallet} from "@solana/wallet-adapter-react";
import {useAuth} from "./useAuth.ts";
import {getNonce, login} from "../api/auth.ts";
import bs58 from "bs58";

export function useLogin() {
    const {publicKey, signMessage} = useWallet();
    const {setUser} = useAuth();

    //登陆,获取nonce->钱包签名,然后返回后端
    async function handleLogin() {
        if (!publicKey || !signMessage) {
            throw new Error("请先连接钱包!")
        }

        const pubkey = publicKey.toBase58();

        //获取nonce
        const {nonce} = await getNonce(pubkey);

        //签名nonce
        const msg=new TextEncoder().encode(nonce);
        const signed=await signMessage(msg);
        const sig=bs58.encode(signed);

        //返回后端
        await login({pubkey,sig,nonce});
        //获取用户信息
        const { getMe } = await import('../api/auth')
        const user=await getMe();
        setUser(user)
    }

    //登出
    async function handleLogout(){
        const {logout}=await import('../api/auth.ts')
        await logout();
        setUser(null)
    }
    return { handleLogin, handleLogout }
}