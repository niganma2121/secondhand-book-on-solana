/**
 * 钱包按钮 UI 调试占位 — 接入 @solana/wallet-adapter 后由 hook 替换，
 * 不要在组件里写死地址 / 余额。
 */
export const fixtureWalletDevDisplay = {
    connected: false,
    address: "0x1A2b3C4d5E6f7A8b9C0d1E2f",
    /** 展示文案；链上实际以钱包 / RPC 为准 */
    balanceLabel: "0.128 SOL",
} as const
