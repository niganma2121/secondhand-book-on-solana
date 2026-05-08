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
  return apiFetch<BroadcastResponse>('/escrow/ship/broadcast', {
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
  return apiFetch<BroadcastResponse>('/escrow/confirm/broadcast', {
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
  return apiFetch<BroadcastResponse>('/escrow/cancel/broadcast', {
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
  return apiFetch<BroadcastResponse>('/escrow/dispute/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
