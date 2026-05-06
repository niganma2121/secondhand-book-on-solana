import { Transaction } from '@solana/web3.js'
import { apiFetch } from '@/lib/api/client'

type UnsignedTxResponse = {
  tx: string
  msg: string
}

type BroadcastResponse = {
  signature: string
  msg: string
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function buildCreateEscrow(input: {
  buyer: string
  seller: string
  asset: string
  collection: string
}) {
  return apiFetch<UnsignedTxResponse>('/escrow/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function signEscrowTxWithWallet(
  txBase64: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
) {
  const tx = Transaction.from(base64ToUint8(txBase64))
  const signed = await signTransaction(tx)
  return uint8ToBase64(
    signed.serialize({ requireAllSignatures: true, verifySignatures: true }),
  )
}

export async function broadcastCreateEscrow(input: {
  signed_tx: string
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
  price: number
}) {
  return apiFetch<BroadcastResponse>('/escrow/create/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastCreateEscrowAuto(input: {
  signed_tx: string
  asset: string
  seller: string
  buyer: string
  price: number
}) {
  return apiFetch<BroadcastResponse>('/escrow/create/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
