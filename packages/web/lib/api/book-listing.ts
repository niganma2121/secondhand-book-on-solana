import { Transaction } from '@solana/web3.js'
import { apiFetch } from '@/lib/api/client'

export type BookImageUploadInput = {
  file: File
}

export type CreateBookBuildInput = {
  seller: string
  name: string
  description: string
  priceLamports: number
  condition: string
  author?: string
  series?: string
  category: string
  coverImage: File
  detailImages: BookImageUploadInput[]
}

export type CreateBookBuildResponse = {
  tx: string
  asset: string
  book_pda: string
  msg: string
  cover_url: string
  detail_urls: string[]
  metadata_url: string
  metadata_hash: number[]
}

type UploadBookImageResponse = {
  cid: string
  url: string
  mime_type: string
  msg: string
}

type CreateBookMetadataApiResponse = {
  metadata_cid: string
  metadata_url: string
  metadata_hash: number[]
  msg: string
}

type BroadcastCreateBookInput = {
  signedTx: string
  build: CreateBookBuildResponse
  seller: string
  priceLamports: number
  name: string
  author?: string
  series?: string
  category: string
  condition: string
}

type RelistBookBuildInput = {
  seller: string
  asset: string
  description: string
  priceLamports: number
  condition: string
  name: string
  coverImage: File
  detailImages: BookImageUploadInput[]
}

type BroadcastRelistBookInput = {
  signedTx: string
  build: CreateBookBuildResponse
  seller: string
  asset: string
  priceLamports: number
  name: string
  author?: string
  series?: string
  category: string
  condition: string
}

export type BroadcastCreateBookResponse = {
  signature: string
  msg: string
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function fileMimeOrDefault(file: File): string | undefined {
  const mime = file.type?.trim()
  return mime.length > 0 ? mime : undefined
}

type PinataSignedPayload = {
  upload_url: string
  expires_in: number
  max_file_size: number
  ipfs_gateway_base: string
  msg: string
}

function extractPinataCid(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (typeof o.cid === 'string') return o.cid
  if (typeof o.IpfsHash === 'string') return o.IpfsHash
  if (o.data && typeof o.data === 'object') {
    const d = o.data as Record<string, unknown>
    if (typeof d.cid === 'string') return d.cid
    if (typeof d.IpfsHash === 'string') return d.IpfsHash
  }
  return null
}

/**
 * 先向 book_server 申请短期签名 URL（Redis 限流），再直传 Pinata（大图不经 Axum）。
 */
async function uploadBookImageViaPinataDirect(
  file: File,
  purpose: 'cover' | 'detail',
): Promise<UploadBookImageResponse> {
  const sign = await apiFetch<PinataSignedPayload>('/book/create/upload/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose }),
    timeoutMs: 30_000,
  })
  if (file.size > sign.max_file_size) {
    throw new Error(`文件超过服务端允许的最大字节数（${sign.max_file_size}）`)
  }
  const fd = new FormData()
  fd.append('file', file)
  fd.append('network', 'public')
  let res: Response
  try {
    res = await fetch(sign.upload_url, { method: 'POST', body: fd })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    throw new Error(
      `无法上传至 Pinata：${m}。若仅本地开发，请检查网络与 CORS。`,
    )
  }
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || `Pinata 上传失败（HTTP ${res.status}）`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error(`Pinata 返回非 JSON：${text.slice(0, 240)}`)
  }
  const cid = extractPinataCid(parsed)
  if (!cid) {
    throw new Error('Pinata 响应中未找到 cid，请联系后端核对 Pinata API 版本')
  }
  const base = sign.ipfs_gateway_base.replace(/\/$/, '')
  const url = `${base}/${cid}`
  const mime = file.type?.trim() || 'application/octet-stream'
  return { cid, url, mime_type: mime, msg: '上传成功' }
}

/** 分步：上传封面（经签名 URL 直传 Pinata） */
export async function uploadCreateBookCover(file: File): Promise<UploadBookImageResponse> {
  return uploadBookImageViaPinataDirect(file, 'cover')
}

/** 分步：上传单张详情图 */
export async function uploadCreateBookDetail(file: File): Promise<UploadBookImageResponse> {
  return uploadBookImageViaPinataDirect(file, 'detail')
}

/** 分步：上传元数据 JSON */
export async function createBookMetadata(input: {
  seller: string
  name: string
  description: string
  condition: string
  coverUrl: string
  details: { url: string; mime_type: string }[]
}): Promise<CreateBookMetadataApiResponse> {
  return apiFetch<CreateBookMetadataApiResponse>('/book/create/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seller: input.seller,
      name: input.name,
      description: input.description,
      condition: input.condition,
      cover_url: input.coverUrl,
      details: input.details,
    }),
    timeoutMs: 120_000,
  })
}

/** 分步：仅组装链上交易 */
export async function buildCreateBookTx(input: {
  seller: string
  name: string
  priceLamports: number
  coverUrl: string
  detailUrls: string[]
  metadata_cid: string
  metadata_url: string
  metadata_hash: number[]
}): Promise<CreateBookBuildResponse> {
  return apiFetch<CreateBookBuildResponse>('/book/create/build-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seller: input.seller,
      name: input.name,
      price: input.priceLamports,
      cover_url: input.coverUrl,
      detail_urls: input.detailUrls,
      metadata_cid: input.metadata_cid,
      metadata_url: input.metadata_url,
      metadata_hash: input.metadata_hash,
    }),
    timeoutMs: 120_000,
  })
}

/**
 * 上架第一步：分接口上传与构建（封面 → 详情 → 元数据 → 组交易）。
 * `onProgress` 用于 UI 展示当前子阶段。
 */
export async function buildCreateBook(
  input: CreateBookBuildInput,
  onProgress?: (label: string) => void,
): Promise<CreateBookBuildResponse> {
  onProgress?.('上传封面…')
  const cover = await uploadCreateBookCover(input.coverImage)

  const details: { url: string; mime_type: string }[] = []
  const n = input.detailImages.length
  for (let i = 0; i < n; i++) {
    onProgress?.(n > 0 ? `上传详情图（${i + 1}/${n}）…` : '上传详情图…')
    const r = await uploadCreateBookDetail(input.detailImages[i].file)
    details.push({ url: r.url, mime_type: r.mime_type })
  }

  onProgress?.('生成并上传元数据…')
  const meta = await createBookMetadata({
    seller: input.seller,
    name: input.name,
    description: input.description,
    condition: input.condition,
    coverUrl: cover.url,
    details,
  })

  onProgress?.('组装链上交易…')
  return buildCreateBookTx({
    seller: input.seller,
    name: input.name,
    priceLamports: input.priceLamports,
    coverUrl: cover.url,
    detailUrls: details.map((d) => d.url),
    metadata_cid: meta.metadata_cid,
    metadata_url: meta.metadata_url,
    metadata_hash: meta.metadata_hash,
  })
}

/** 兼容旧路径：一步式 JSON 上传（仍可用，体较大） */
export async function buildCreateBookMonolithic(
  input: CreateBookBuildInput,
): Promise<CreateBookBuildResponse> {
  const coverBytes = await fileToNumberArray(input.coverImage)
  const detailPayload = await Promise.all(
    input.detailImages.map(async ({ file }) => ({
      bytes: await fileToNumberArray(file),
      filename: file.name,
      mime_type: fileMimeOrDefault(file),
    })),
  )

  return apiFetch<CreateBookBuildResponse>('/book/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seller: input.seller,
      name: input.name,
      description: input.description,
      price: input.priceLamports,
      condition: input.condition,
      author: input.author ?? null,
      series: input.series ?? null,
      category: input.category,
      cover_image: coverBytes,
      cover_filename: input.coverImage.name,
      cover_mime_type: fileMimeOrDefault(input.coverImage),
      detail_images: detailPayload,
    }),
    timeoutMs: 300_000,
  })
}

async function fileToNumberArray(file: File): Promise<number[]> {
  const ab = await file.arrayBuffer()
  return Array.from(new Uint8Array(ab))
}

export async function signSerializedTxWithWallet(
  txBase64: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<string> {
  const tx = Transaction.from(base64ToUint8(txBase64))
  const signed = await signTransaction(tx)
  return uint8ToBase64(
    signed.serialize({ requireAllSignatures: true, verifySignatures: true }),
  )
}

export async function broadcastCreateBook(
  input: BroadcastCreateBookInput,
): Promise<BroadcastCreateBookResponse> {
  return apiFetch<BroadcastCreateBookResponse>('/book/create/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signed_tx: input.signedTx,
      asset: input.build.asset,
      book_pda: input.build.book_pda,
      seller: input.seller,
      price: input.priceLamports,
      metadata_url: input.build.metadata_url,
      metadata_hash: input.build.metadata_hash,
      name: input.name,
      author: input.author ?? null,
      series: input.series ?? null,
      category: input.category,
      condition: input.condition,
      cover_url: input.build.cover_url,
      detail_urls: input.build.detail_urls,
    }),
    timeoutMs: 120_000,
  })
}

export async function buildRelistBook(
  input: RelistBookBuildInput,
  onProgress?: (label: string) => void,
): Promise<CreateBookBuildResponse> {
  onProgress?.('上传封面…')
  const cover = await uploadCreateBookCover(input.coverImage)

  const details: { url: string; mime_type: string }[] = []
  const n = input.detailImages.length
  for (let i = 0; i < n; i++) {
    onProgress?.(n > 0 ? `上传详情图（${i + 1}/${n}）…` : '上传详情图…')
    const r = await uploadCreateBookDetail(input.detailImages[i].file)
    details.push({ url: r.url, mime_type: r.mime_type })
  }

  onProgress?.('生成并上传元数据…')
  const meta = await createBookMetadata({
    seller: input.seller,
    name: input.name,
    description: input.description,
    condition: input.condition,
    coverUrl: cover.url,
    details,
  })

  onProgress?.('组装转卖交易…')
  return apiFetch<CreateBookBuildResponse>('/book/relist/build-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seller: input.seller,
      asset: input.asset,
      price: input.priceLamports,
      cover_url: cover.url,
      detail_urls: details.map((d) => d.url),
      metadata_cid: meta.metadata_cid,
      metadata_url: meta.metadata_url,
      metadata_hash: meta.metadata_hash,
    }),
    timeoutMs: 120_000,
  })
}

export async function broadcastRelistBook(
  input: BroadcastRelistBookInput,
): Promise<BroadcastCreateBookResponse> {
  return apiFetch<BroadcastCreateBookResponse>('/book/relist/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signed_tx: input.signedTx,
      asset: input.asset,
      seller: input.seller,
      price: input.priceLamports,
      metadata_url: input.build.metadata_url,
      metadata_hash: input.build.metadata_hash,
      name: input.name,
      author: input.author ?? null,
      series: input.series ?? null,
      category: input.category,
      condition: input.condition,
      cover_url: input.build.cover_url,
      detail_urls: input.build.detail_urls,
    }),
    timeoutMs: 120_000,
  })
}
