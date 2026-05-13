/**
 * 解密「我的收货地址」库中行（买家本地通讯私钥），与购买弹窗一致。
 */

import type { ShippingAddressPayload } from '@/lib/api/shipping-addresses'

export function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function sha256(data: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

/** 与个人中心「保存地址」相同的自加密结构，供 POST /me/shipping-addresses 使用 */
export async function encryptShippingJsonForSelf(
  encryptionPublicKeyBase64: string,
  payload: {
    label: string
    name: string
    phone: string
    region: string
    provinceCode: string
    cityCode: string
    districtCode: string
    detail: string
  },
): Promise<{
  buyer_ciphertext: string
  buyer_nonce: string
  buyer_alg: string
  encryption_key_version: string
}> {
  const selfPub = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(encryptionPublicKeyBase64),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    [],
  )
  const eph = (await crypto.subtle.generateKey(
    { name: 'X25519' } as EcKeyGenParams,
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'X25519', public: selfPub } as EcdhKeyDeriveParams,
      eph.privateKey,
      256,
    ),
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keySeed = new Uint8Array(shared.length + iv.length)
  keySeed.set(shared, 0)
  keySeed.set(iv, shared.length)
  const aesRaw = await sha256(keySeed)
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['encrypt'])
  const plain = JSON.stringify(payload)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plain)),
  )
  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  return {
    buyer_ciphertext: JSON.stringify({ epk: bytesToBase64(ephPub), ct: bytesToBase64(ct) }),
    buyer_nonce: bytesToBase64(iv),
    buyer_alg: 'x25519_aesgcm_v1',
    encryption_key_version: 'v1',
  }
}

export type DecryptedShippingAddressRow = {
  id: string
  label: string
  name: string
  phone: string
  region: string
  provinceCode: string
  cityCode: string
  districtCode: string
  detail: string
}

export function formatShippingAddressPlaintext(a: DecryptedShippingAddressRow) {
  return [a.name, a.phone, a.region, a.detail].filter(Boolean).join('，')
}

export async function decryptMyShippingAddressPayload(
  payload: ShippingAddressPayload,
  walletPubkey: string,
): Promise<DecryptedShippingAddressRow> {
  const raw = localStorage.getItem(`bookchain:comm-key:${walletPubkey}`)
  if (!raw) throw new Error('本地通讯私钥不存在，请先在个人中心完成通讯密钥初始化。')
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(raw),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    ['deriveBits'],
  )
  const parsed = JSON.parse(payload.buyer_ciphertext) as { epk: string; ct: string }
  const ephPub = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(parsed.epk),
    { name: 'X25519' } as EcKeyImportParams,
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'X25519', public: ephPub } as EcdhKeyDeriveParams,
      key,
      256,
    ),
  )
  const iv = base64ToBytes(payload.buyer_nonce)
  const keySeed = new Uint8Array(shared.length + iv.length)
  keySeed.set(shared, 0)
  keySeed.set(iv, shared.length)
  const aesRaw = await sha256(keySeed)
  const aes = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, base64ToBytes(parsed.ct))
  const decoded = JSON.parse(new TextDecoder().decode(plain)) as {
    label?: string
    name?: string
    phone?: string
    region?: string
    provinceCode?: string
    cityCode?: string
    districtCode?: string
    detail?: string
  }
  return {
    id: String(payload.id),
    label: decoded.label ?? '地址',
    name: decoded.name ?? '',
    phone: decoded.phone ?? '',
    region: decoded.region ?? '',
    provinceCode: decoded.provinceCode ?? '',
    cityCode: decoded.cityCode ?? '',
    districtCode: decoded.districtCode ?? '',
    detail: decoded.detail ?? '',
  }
}
