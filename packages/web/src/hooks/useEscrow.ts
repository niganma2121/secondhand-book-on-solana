import {useState} from "react";
import {useWallet} from "@solana/wallet-adapter-react";
import {Transaction} from "@solana/web3.js";
import {broadcastEscrow, createEscrow} from "../api/escrow";

export function useEscrow() {
    const {signTransaction} = useWallet();
    const [isProcessing, setIsProcessing] = useState(false);

    const buyBook = async (asset: string) => {
        if (!signTransaction) throw new Error("钱包未就绪");

        setIsProcessing(true);
        try {
            //获取后端构建的交易
            const {tx: txBase64} = await createEscrow(asset);

            //反序列化并请求用户钱包签名
            const transaction = Transaction.from(Buffer.from(txBase64, 'base64'));
            const signedTx = await signTransaction(transaction);
            const signedBase64 = signedTx.serialize().toString('base64');

            //广播上链
            return await broadcastEscrow(signedBase64);
        } finally {
            setIsProcessing(false);
        }
    };

    return {buyBook, isProcessing};
}