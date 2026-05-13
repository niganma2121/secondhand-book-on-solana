/**
 * 买家使用本地通讯私钥 + 卖家加密公钥，加密收货明文（与购买流程一致）。
 */

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256(data: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

export async function encryptShippingPlaintextForSeller(
  sellerEncPubB64: string,
  plain: string,
  buyerPubkey: string,
): Promise<{
  seller_ciphertext: string
  seller_nonce: string
  seller_alg: string
}> {
  const key = localStorage.getItem(`bookchain:comm-key:${buyerPubkey}`)
  if (!key) throw new Error('本地通讯私钥不存在，请先到个人中心完成通讯密钥初始化。')
  const sellerPub = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(sellerEncPubB64),
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
      { name: 'X25519', public: sellerPub } as EcdhKeyDeriveParams,
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
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plain)),
  )
  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  let binaryIv = ''
  for (let i = 0; i < iv.length; i++) binaryIv += String.fromCharCode(iv[i])
  let binaryEpk = ''
  for (let i = 0; i < ephPub.length; i++) binaryEpk += String.fromCharCode(ephPub[i])
  let binaryCt = ''
  for (let i = 0; i < ct.length; i++) binaryCt += String.fromCharCode(ct[i])
  return {
    seller_ciphertext: JSON.stringify({ epk: btoa(binaryEpk), ct: btoa(binaryCt) }),
    seller_nonce: btoa(binaryIv),
    seller_alg: 'x25519_aesgcm_v1',
  }
}
