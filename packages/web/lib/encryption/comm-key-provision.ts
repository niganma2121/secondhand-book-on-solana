import { ApiError } from '@/lib/api/client'
import {
  fetchEncryptionTemplates,
  fetchMyEncryptionBackup,
  upsertMyEncryptionBackup,
  type EncryptionTemplate,
  type MyEncryptionBackup,
} from '@/lib/api/encryption'

export function commKeyLocalStorageKey(walletAddress: string) {
  return `bookchain:comm-key:${walletAddress}`
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function fillMessageTemplate(tpl: string, pubkey: string) {
  if (typeof window === 'undefined') return tpl
  return tpl.replaceAll('{pubkey}', pubkey).replaceAll('{origin}', window.location.origin)
}

async function deriveAesKey(signature: Uint8Array, salt: Uint8Array) {
  const merged = new Uint8Array(signature.length + salt.length)
  merged.set(signature, 0)
  merged.set(salt, signature.length)
  const digest = await crypto.subtle.digest('SHA-256', merged)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function createAndUploadBackup(
  walletAddress: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  template: EncryptionTemplate,
) {
  const storageKey = commKeyLocalStorageKey(walletAddress)
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'X25519' } as EcKeyGenParams,
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const exportedPub = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
  const exportedPriv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const msg = fillMessageTemplate(template.message_template, walletAddress)
  const sig = await signMessage(new TextEncoder().encode(msg))
  const aes = await deriveAesKey(sig, salt)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, exportedPriv)
  await upsertMyEncryptionBackup({
    backup_version: template.version,
    encryption_public_key: bytesToBase64(exportedPub),
    encrypted_private_key: bytesToBase64(new Uint8Array(encrypted)),
    nonce: bytesToBase64(iv),
    kdf_salt: bytesToBase64(salt),
    kdf_params: template.kdf_params,
  })
  localStorage.setItem(storageKey, bytesToBase64(exportedPriv))
}

async function restoreFromServerBackup(
  walletAddress: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  backup: MyEncryptionBackup,
  template: EncryptionTemplate,
) {
  const storageKey = commKeyLocalStorageKey(walletAddress)
  if (localStorage.getItem(storageKey)) return
  const msg = fillMessageTemplate(template.message_template, walletAddress)
  const sig = await signMessage(new TextEncoder().encode(msg))
  const aes = await deriveAesKey(sig, base64ToBytes(backup.kdf_salt))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(backup.nonce) },
    aes,
    base64ToBytes(backup.encrypted_private_key),
  )
  localStorage.setItem(storageKey, bytesToBase64(new Uint8Array(plain)))
}

export type EnsureCommKeyOutcome =
  | { status: 'skipped' }
  | { status: 'restored'; backup: MyEncryptionBackup }
  | { status: 'created'; backup: MyEncryptionBackup }

const ensureInFlight = new Map<string, Promise<EnsureCommKeyOutcome>>()

async function runEnsureCommKeyReady(params: {
  walletAddress: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}): Promise<EnsureCommKeyOutcome> {
  const { walletAddress, signMessage } = params
  const storageKey = commKeyLocalStorageKey(walletAddress)
  if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) {
    return { status: 'skipped' }
  }

  const [tplRes, backupRes] = await Promise.all([
    fetchEncryptionTemplates(),
    fetchMyEncryptionBackup().catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }),
  ])

  if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) {
    return { status: 'skipped' }
  }

  if (backupRes) {
    const tpl = tplRes.templates.find((x) => x.version === backupRes.backup_version)
    if (!tpl) {
      throw new Error('服务端备份版本与当前加密模板不兼容')
    }
    await restoreFromServerBackup(walletAddress, signMessage, backupRes, tpl)
    return { status: 'restored', backup: backupRes }
  }

  const template = tplRes.templates[0]
  if (!template) {
    throw new Error('未找到可用加密模板')
  }
  await createAndUploadBackup(walletAddress, signMessage, template)
  const backup = await fetchMyEncryptionBackup()
  return { status: 'created', backup }
}

/**
 * 若本地尚无通讯私钥，则从服务端备份恢复或新建 X25519 密钥对并上传加密备份。
 * 卖家：`encryption_public_key` 供买家 ECDH 加密收货信息；买家：同一公钥用于自加密地址存库、本地私钥解密。
 */
export async function ensureCommKeyReady(params: {
  walletAddress: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}): Promise<EnsureCommKeyOutcome> {
  const storageKey = commKeyLocalStorageKey(params.walletAddress)
  if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) {
    return { status: 'skipped' }
  }

  const existing = ensureInFlight.get(params.walletAddress)
  if (existing) return existing

  const work = runEnsureCommKeyReady(params)
  ensureInFlight.set(params.walletAddress, work)
  try {
    return await work
  } finally {
    ensureInFlight.delete(params.walletAddress)
  }
}
