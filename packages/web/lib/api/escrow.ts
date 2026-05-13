import { Transaction } from '@solana/web3.js'
import { apiFetch } from '@/lib/api/client'

type UnsignedTxResponse = {
  tx: string
  msg: string
}

export type EscrowBroadcastResponse = {
  signature: string
  msg: string
  /** 链上已成功时，数据库是否已与链上一致；未返回时可忽略 */
  db_synced?: boolean
  db_sync_note?: string
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
  return apiFetch<EscrowBroadcastResponse>('/escrow/create/broadcast', {
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
  return apiFetch<EscrowBroadcastResponse>('/escrow/create/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function buildShipEscrow(input: {
  seller: string
  buyer: string
  asset: string
  shipping_commitment: number[]
}) {
  return apiFetch<UnsignedTxResponse>('/escrow/ship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastShipEscrow(input: {
  signed_tx: string
  escrow_pda: string
  shipping_commitment: number[]
}) {
  return apiFetch<EscrowBroadcastResponse>('/escrow/ship/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function buildSetPreShipLock(input: {
  seller: string
  buyer: string
  asset: string
}) {
  return apiFetch<UnsignedTxResponse>('/escrow/pre-ship-lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastSetPreShipLock(input: {
  signed_tx: string
  escrow_pda: string
}) {
  return apiFetch<EscrowBroadcastResponse>('/escrow/pre-ship-lock/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function buildConfirmEscrow(input: {
  buyer: string
  seller: string
  asset: string
  collection: string
}) {
  return apiFetch<UnsignedTxResponse>('/escrow/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastConfirmEscrow(input: {
  signed_tx: string
  escrow_pda: string
  asset: string
  seller: string
  buyer: string
}) {
  return apiFetch<EscrowBroadcastResponse>('/escrow/confirm/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function buildCancelEscrow(input: {
  signer: string
  buyer: string
  seller: string
  asset: string
  collection: string
}) {
  return apiFetch<UnsignedTxResponse>('/escrow/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastCancelEscrow(input: {
  signed_tx: string
  escrow_pda: string
  asset: string
}) {
  return apiFetch<EscrowBroadcastResponse>('/escrow/cancel/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function buildOpenDispute(input: {
  signer: string
  buyer: string
  seller: string
  asset: string
}) {
  return apiFetch<UnsignedTxResponse>('/escrow/dispute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function broadcastOpenDispute(input: {
  signed_tx: string
  escrow_pda: string
}) {
  return apiFetch<EscrowBroadcastResponse>('/escrow/dispute/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
