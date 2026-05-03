import { PublicKey } from '@solana/web3.js'

/** 校验并规范化 Base58 公钥；非法返回 null */
export function tryNormalizeSolanaPubkey(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  try {
    return new PublicKey(s).toBase58()
  } catch {
    return null
  }
}
