'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { useBookCategories } from '@/lib/hooks/use-book-categories'
import { useBookConditions } from '@/lib/hooks/use-book-conditions'
import { useSolCnyRate } from '@/lib/hooks/use-sol-cny-rate'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  resolveGoogleBooksCoverUrl,
  searchGoogleBooks,
  type GoogleBooksHit,
} from '@/lib/api/google-books'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, RefreshCw, ZoomIn } from 'lucide-react'
import { ApiError } from '@/lib/api/client'
import {
  broadcastRelistBook,
  broadcastCreateBook,
  buildRelistBook,
  buildCreateBook,
  signSerializedTxWithWallet,
} from '@/lib/api/book-listing'
import { fetchBookDetail } from '@/lib/api/book-detail'

interface FormState {
  title: string
  author: string
  isbn: string
  /** `book_categories.key`，提交上架接口时使用 */
  category: string
  /** `book_conditions.key`，提交上架接口时使用 */
  condition: string
  price: string
  description: string
  coverPreview: string | null
}

type DetailImageItem = { id: string; file: File; preview: string; sourceFingerprint: string }

const MAX_DETAIL_IMAGES = 5
const MIN_DETAIL_IMAGES = 2
const MAX_COVER_FILE_BYTES = 3 * 1024 * 1024
const MAX_DETAIL_FILE_BYTES = 5 * 1024 * 1024
const COVER_MAX_EDGE = 1800
const DETAIL_MAX_EDGE = 2600

function newDetailId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function fingerprintFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('解析图片失败'))
    img.src = dataUrl
  })
}

async function compressImageIfNeeded(file: File, maxBytes: number, maxEdge: number): Promise<File> {
  if (file.size <= maxBytes) return file
  const img = await loadImageElement(file)
  let scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const qualities = [0.9, 0.84, 0.78, 0.72, 0.66]

  for (let round = 0; round < 3; round++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('浏览器不支持图片压缩')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', quality)
      })
      if (!blob) continue
      if (blob.size <= maxBytes) {
        if (blob.size >= file.size) return file
        const filename = file.name.replace(/\.[^/.]+$/, '') + '.webp'
        return new File([blob], filename, { type: 'image/webp' })
      }
    }
    scale *= 0.86
  }

  throw new Error(`图片压缩后仍超过 ${Math.round(maxBytes / 1024 / 1024)}MB，请更换更小图片`)
}

const INITIAL_FORM: FormState = {
  title: '', author: '', isbn: '', category: '', condition: '',
  price: '', description: '', coverPreview: null,
}

const PLATFORM_FEE_RATE = 0.02

function MobileCameraButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm transition-colors active:scale-95',
        'bg-primary text-primary-foreground hover:opacity-90',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-primary-foreground">
        <path d="M7.5 3.5h5l1.5 2.5H17a1 1 0 011 1V16a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1h3L7.5 3.5z"
          stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="10" cy="11" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {children}
    </button>
  )
}

function UploadActionButton({
  onClick,
  disabled,
  children,
  mobileFlex = false,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  mobileFlex?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center justify-center gap-2 h-10 rounded-xl border border-border/60 bg-card text-sm text-foreground hover:border-primary/40 transition-colors active:scale-95',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
        mobileFlex ? 'flex-1' : 'px-6',
      ].join(' ')}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-muted-foreground">
        <path d="M10 3v10M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {children}
    </button>
  )
}

function LookupResultCard({
  hit,
  onPick,
  onCoverZoom,
}: {
  hit: GoogleBooksHit
  onPick: () => void
  onCoverZoom: (url: string) => void
}) {
  const displayUrl = resolveGoogleBooksCoverUrl(hit)
  const [imgFailed, setImgFailed] = useState(false)
  const canShowImg = Boolean(displayUrl && !imgFailed)

  return (
    <div className="flex flex-col rounded-xl border border-border/50 bg-card/80 overflow-hidden shadow-sm hover:border-primary/30 transition-colors">
      <div className="relative aspect-[3/4] w-full max-h-[220px] bg-muted border-b border-border/40">
        {canShowImg ? (
          <button
            type="button"
            className="group absolute inset-0 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => displayUrl && onCoverZoom(displayUrl)}
            aria-label="放大查看封面"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl!}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              onError={() => setImgFailed(true)}
            />
            <span className="relative z-10 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shadow-sm pointer-events-none">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden />
              放大
            </span>
          </button>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-2 text-center">
            <span className="text-[11px] text-muted-foreground leading-snug">
              {imgFailed ? '暂无配图' : '无封面'}
            </span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
        <div className="min-h-0">
          <p className="text-sm font-medium text-foreground line-clamp-3 leading-snug">{hit.title}</p>
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
            {hit.authors.length ? hit.authors.join(' / ') : '作者不详'}
            {hit.published_year != null ? ` · ${hit.published_year}` : ''}
          </p>
        </div>
        <Button type="button" size="sm" className="w-full rounded-lg mt-auto shrink-0" onClick={onPick}>
          选用此书
        </Button>
      </div>
    </div>
  )
}

export function ListBookPage() {
  const searchParams = useSearchParams()
  const { publicKey, signTransaction } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const isMobile = useIsMobile()
  const { categories: categoryOptions, loading: categoriesLoading, error: categoriesError } =
    useBookCategories()
  const {
    conditions: conditionOptions,
    loading: conditionsLoading,
    error: conditionsError,
  } = useBookConditions()
  const {
    cnyPerSol,
    source: rateSource,
    loading: rateLoading,
    error: rateError,
    updatedAt: rateUpdatedAt,
    refresh: refreshRate,
  } = useSolCnyRate()
  const [priceMode, setPriceMode] = useState<'cny' | 'sol'>('cny')
  const [cnyDraft, setCnyDraft] = useState('')

  // 封面相关 refs
  const coverFileRef = useRef<HTMLInputElement>(null)
  const coverCameraRef = useRef<HTMLInputElement>(null)
  const detailFilesRef = useRef<HTMLInputElement>(null)
  const detailCameraRef = useRef<HTMLInputElement>(null)
  // ISBN 相关 refs
  const isbnFileRef = useRef<HTMLInputElement>(null)
  const isbnCameraRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [step, setStep] = useState<'form' | 'building' | 'signing' | 'minting' | 'done'>('form')
  /** 分步上架时：封面 / 详情 / 元数据 / 组交易 的当前文案 */
  const [buildPhase, setBuildPhase] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastAsset, setLastAsset] = useState<string | null>(null)
  const [lastSignature, setLastSignature] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const [lookupDialogOpen, setLookupDialogOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [coverLightboxUrl, setCoverLightboxUrl] = useState<string | null>(null)
  const [detailZoomUrl, setDetailZoomUrl] = useState<string | null>(null)
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupResults, setLookupResults] = useState<GoogleBooksHit[]>([])
  const [detailImages, setDetailImages] = useState<DetailImageItem[]>([])
  const [imageProcessing, setImageProcessing] = useState(false)
  const [duplicateHintOpen, setDuplicateHintOpen] = useState(false)
  const [relistPrefillLoading, setRelistPrefillLoading] = useState(false)
  const [relistCategoryRaw, setRelistCategoryRaw] = useState('')

  const priceNum = parseFloat(form.price) || 0
  const platformFee = priceNum * PLATFORM_FEE_RATE
  const youReceive = priceNum - platformFee
  const lamportsDisplay =
    priceNum > 0 ? BigInt(Math.round(Math.min(100, priceNum) * 1_000_000_000)) : null

  const relistAsset = searchParams.get('asset')?.trim() ?? ''
  const isRelistMode = searchParams.get('relist') === '1' && relistAsset.length > 0

  /** 人民币模式：根据汇率同步链上使用的 SOL 字符串 */
  useEffect(() => {
    if (priceMode !== 'cny' || !cnyPerSol) return
    const t = cnyDraft.trim()
    if (!t) {
      setForm((f) => (f.price ? { ...f, price: '' } : f))
      return
    }
    const v = Number.parseFloat(t)
    if (!Number.isFinite(v) || v <= 0) {
      setForm((f) => ({ ...f, price: '' }))
      return
    }
    const sol = Math.min(100, Math.max(1e-9, v / cnyPerSol))
    let p = sol.toFixed(9).replace(/\.?0+$/, '')
    if (p === '') p = String(sol)
    setForm((f) => (f.price === p ? f : { ...f, price: p }))
  }, [cnyPerSol, cnyDraft, priceMode])

  useEffect(() => {
    if (!duplicateHintOpen) return
    const timer = window.setTimeout(() => setDuplicateHintOpen(false), 2000)
    return () => window.clearTimeout(timer)
  }, [duplicateHintOpen])

  useEffect(() => {
    if (!isRelistMode) return
    let cancelled = false

    async function prefillFromRelistAsset() {
      setRelistPrefillLoading(true)
      try {
        const detail = await fetchBookDetail(relistAsset)
        if (cancelled) return
        let isbnFromMetadata = ''
        const metadataUrl = detail.book.metadata_url?.trim()
        if (metadataUrl) {
          try {
            const resp = await fetch(metadataUrl)
            if (resp.ok) {
              const metadata = await resp.json() as { isbn?: unknown; attributes?: Array<{ trait_type?: unknown; value?: unknown }> }
              if (typeof metadata.isbn === 'string' && metadata.isbn.trim()) {
                isbnFromMetadata = metadata.isbn.trim()
              } else if (Array.isArray(metadata.attributes)) {
                const attr = metadata.attributes.find((it) =>
                  typeof it?.trait_type === 'string' && it.trait_type.toLowerCase() === 'isbn',
                )
                if (typeof attr?.value === 'string' && attr.value.trim()) {
                  isbnFromMetadata = attr.value.trim()
                }
              }
            }
          } catch {
            // ignore metadata parse failure; keep manual input fallback
          }
        }
        let coverFromOrigin: File | null = null
        const coverUrl = detail.book.cover_url?.trim()
        if (coverUrl) {
          try {
            const coverResp = await fetch(coverUrl)
            if (coverResp.ok) {
              const coverBlob = await coverResp.blob()
              const ext = coverBlob.type.split('/')[1] || 'jpg'
              coverFromOrigin = new File([coverBlob], `relist-cover.${ext}`, {
                type: coverBlob.type || 'image/jpeg',
              })
            }
          } catch {
            // keep null; user can manually upload
          }
        }

        setForm((f) => ({
          ...f,
          title: detail.book.name || f.title,
          author: detail.book.author || f.author,
          category: '',
          isbn: isbnFromMetadata || f.isbn,
          condition: '',
          price: '',
          description: '',
          coverPreview: coverUrl || f.coverPreview,
        }))
        setRelistCategoryRaw(detail.book.category || '')
        setCoverFile(coverFromOrigin)
        setErrors((prev) => ({
          ...prev,
          title: undefined,
          author: undefined,
          category: undefined,
          condition: undefined,
          price: undefined,
          description: undefined,
        }))
        setCnyDraft('')
        setPriceMode('cny')
        setSubmitError(null)
      } catch {
        if (!cancelled) {
          setSubmitError('转卖预填失败，请手动填写上架信息')
        }
      } finally {
        if (!cancelled) {
          setRelistPrefillLoading(false)
        }
      }
    }

    void prefillFromRelistAsset()
    return () => {
      cancelled = true
    }
  }, [isRelistMode, relistAsset])

  useEffect(() => {
    if (!isRelistMode || !relistCategoryRaw.trim() || categoryOptions.length === 0) return
    const raw = relistCategoryRaw.trim().toLowerCase()
    const matched = categoryOptions.find((c) => {
      const key = c.key.trim().toLowerCase()
      const label = c.label.trim().toLowerCase()
      return key === raw || label === raw
    })
    if (!matched) return
    setForm((f) => (f.category === matched.key ? f : { ...f, category: matched.key }))
    setErrors((prev) => ({ ...prev, category: undefined }))
    setRelistCategoryRaw('')
  }, [isRelistMode, relistCategoryRaw, categoryOptions])

  function validate() {
    const e: typeof errors = {}
    if (!form.title.trim()) e.title = '请填写书名'
    if (!form.author.trim()) e.author = '请填写作者'
    if (!form.category.trim()) e.category = '请选择分类'
    if (!form.condition) e.condition = '请选择品相'
    if (!form.price || isNaN(priceNum) || priceNum <= 0) e.price = '请输入有效价格'
    if (priceNum > 100) e.price = '价格不能超过 100 SOL'
    if (!form.description.trim()) e.description = '请填写书籍描述'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function readFile(file: File, cb: (dataUrl: string) => void) {
    const reader = new FileReader()
    reader.onload = (ev) => cb(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setSubmitError('封面文件必须是图片格式')
        e.target.value = ''
        return
      }
      try {
        setImageProcessing(true)
        const processed = await compressImageIfNeeded(file, MAX_COVER_FILE_BYTES, COVER_MAX_EDGE)
        setSubmitError(null)
        setCoverFile(processed)
        readFile(processed, (url) => setForm((f) => ({ ...f, coverPreview: url })))
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : '封面处理失败')
      } finally {
        setImageProcessing(false)
      }
    }
    e.target.value = ''
  }

  async function handleDetailFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list?.length) return
    const remaining = MAX_DETAIL_IMAGES - detailImages.length
    if (remaining <= 0) {
      e.target.value = ''
      return
    }
    const next: DetailImageItem[] = []
    const existingFingerprints = new Set(detailImages.map((img) => img.sourceFingerprint))
    let duplicatedCount = 0
    setImageProcessing(true)
    for (let i = 0; i < list.length && next.length < remaining; i++) {
      const file = list[i]
      if (!file.type.startsWith('image/')) continue
      const sourceFingerprint = await fingerprintFile(file)
      if (existingFingerprints.has(sourceFingerprint)) {
        duplicatedCount++
        setDuplicateHintOpen(true)
        continue
      }
      let processed: File
      try {
        processed = await compressImageIfNeeded(file, MAX_DETAIL_FILE_BYTES, DETAIL_MAX_EDGE)
      } catch {
        setSubmitError(`详情图处理失败或仍超过 5MB：${file.name}`)
        continue
      }
      existingFingerprints.add(sourceFingerprint)
      next.push({
        id: newDetailId(),
        file: processed,
        preview: URL.createObjectURL(processed),
        sourceFingerprint,
      })
    }
    if (next.length > 0 && duplicatedCount === 0) {
      setSubmitError(null)
    }
    if (duplicatedCount > 0 && next.length === 0) {
      setSubmitError('检测到重复详情图，已自动跳过')
    }
    if (next.length) setDetailImages((prev) => [...prev, ...next])
    setImageProcessing(false)
    e.target.value = ''
  }

  function removeDetailImage(id: string) {
    setDetailImages((prev) => {
      const item = prev.find((x) => x.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return prev.filter((x) => x.id !== id)
    })
  }

  function handleIsbnPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    // 实际项目中这里可接 OCR API 解析 ISBN；目前仅做填充提示
    const file = e.target.files?.[0]
    if (!file) return
    // 模拟扫描：填入示例 ISBN
    setForm((f) => ({ ...f, isbn: '978-7-536-69264-6' }))
    e.target.value = ''
  }

  async function submitMintFlow() {
    if (!publicKey) { openWalletConnect(); return }
    if (!validate()) return
    if (!coverFile) {
      setSubmitError('请先上传封面图片')
      return
    }
    if (detailImages.length < MIN_DETAIL_IMAGES) {
      setSubmitError(`请至少上传 ${MIN_DETAIL_IMAGES} 张详情图片`)
      return
    }
    if (!signTransaction) {
      setSubmitError('当前钱包不支持交易签名，请切换钱包后重试')
      return
    }
    setSubmitError(null)
    setLastAsset(null)
    setLastSignature(null)
    let failedStage: 'building' | 'signing' | 'minting' = 'building'
    try {
      const priceLamports = Math.round(priceNum * 1_000_000_000)
      if (!Number.isFinite(priceLamports) || priceLamports <= 0) {
        setSubmitError('价格换算失败，请检查 SOL 定价')
        return
      }
      const parsedCny = Number.parseFloat(cnyDraft)
      const priceCny =
        Number.isFinite(parsedCny) && parsedCny > 0 ? Number(parsedCny.toFixed(2)) : null
      const fxCnyPerSolSnapshot =
        cnyPerSol != null && Number.isFinite(cnyPerSol) && cnyPerSol > 0 ? cnyPerSol : null

      setBuildPhase('')
      setStep('building')
      console.info('[list-book] stage=building start', {
        detailCount: detailImages.length,
        coverSize: coverFile.size,
      })
      const buildRes = isRelistMode
        ? await buildRelistBook(
            {
              seller: publicKey.toBase58(),
              asset: relistAsset,
              name: form.title.trim(),
              description: form.description.trim(),
              priceLamports,
              condition: form.condition,
              coverImage: coverFile,
              detailImages: detailImages.map((d) => ({ file: d.file })),
            },
            (label) => setBuildPhase(label),
          )
        : await buildCreateBook(
            {
              seller: publicKey.toBase58(),
              name: form.title.trim(),
              description: form.description.trim(),
              priceLamports,
              condition: form.condition,
              author: form.author.trim() || undefined,
              series: undefined,
              category: form.category,
              coverImage: coverFile,
              detailImages: detailImages.map((d) => ({ file: d.file })),
            },
            (label) => setBuildPhase(label),
          )
      console.info('[list-book] stage=building done', {
        asset: buildRes.asset,
        bookPda: buildRes.book_pda,
      })

      setStep('signing')
      failedStage = 'signing'
      console.info('[list-book] stage=signing start')
      const signedTx = await signSerializedTxWithWallet(buildRes.tx, signTransaction)
      console.info('[list-book] stage=signing done')

      setStep('minting')
      failedStage = 'minting'
      console.info('[list-book] stage=minting start')
      const broadcast = isRelistMode
        ? await broadcastRelistBook({
            signedTx,
            build: buildRes,
            seller: publicKey.toBase58(),
            asset: relistAsset,
            priceLamports,
            priceCny,
            fxCnyPerSol: fxCnyPerSolSnapshot,
            name: form.title.trim(),
            author: form.author.trim() || undefined,
            series: undefined,
            category: form.category,
            condition: form.condition,
          })
        : await broadcastCreateBook({
            signedTx,
            build: buildRes,
            seller: publicKey.toBase58(),
            priceLamports,
            priceCny,
            fxCnyPerSol: fxCnyPerSolSnapshot,
            name: form.title.trim(),
            author: form.author.trim() || undefined,
            series: undefined,
            category: form.category,
            condition: form.condition,
          })
      console.info('[list-book] stage=minting done', { signature: broadcast.signature })

      setLastAsset(buildRes.asset)
      setLastSignature(broadcast.signature)
      setStep('done')
    } catch (e) {
      setStep('form')
      setBuildPhase('')
      console.error('[list-book] submit failed', { stage: failedStage, error: e })
      if (e instanceof ApiError) {
        setSubmitError(`[${failedStage}] ${e.message}`)
      } else if (e instanceof Error) {
        setSubmitError(`[${failedStage}] ${e.message}`)
      } else {
        setSubmitError(`[${failedStage}] 上架失败，请稍后重试`)
      }
    }
  }

  function handleSubmit() {
    if (!publicKey) { openWalletConnect(); return }
    if (!validate()) return
    if (!coverFile) {
      setSubmitError('请先上传封面图片')
      return
    }
    if (detailImages.length < MIN_DETAIL_IMAGES) {
      setSubmitError(`请至少上传 ${MIN_DETAIL_IMAGES} 张详情图片`)
      return
    }
    setSubmitError(null)
    setConfirmChecked(false)
    setConfirmDialogOpen(true)
  }

  function handleReset() {
    detailImages.forEach((d) => URL.revokeObjectURL(d.preview))
    setDetailImages([])
    setForm(INITIAL_FORM)
    setErrors({})
    setStep('form')
    setLookupResults([])
    setLookupError(null)
    setLookupQuery('')
    setLookupDialogOpen(false)
    setConfirmDialogOpen(false)
    setConfirmChecked(false)
    setCoverLightboxUrl(null)
    setDetailZoomUrl(null)
    setCnyDraft('')
    setPriceMode('cny')
    setSubmitError(null)
    setLastAsset(null)
    setLastSignature(null)
    setBuildPhase('')
    setCoverFile(null)
  }

  function togglePriceMode(next: 'cny' | 'sol') {
    if (next === priceMode) return
    if (next === 'cny' && cnyPerSol) {
      const s = Number.parseFloat(form.price)
      if (Number.isFinite(s) && s > 0) setCnyDraft((s * cnyPerSol).toFixed(2))
    }
    setPriceMode(next)
  }

  const runGoogleBooksSearch = useCallback(async () => {
    const q = lookupQuery.trim()
    if (!q) {
      setLookupError('请输入书名或关键词')
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    try {
      const results = await searchGoogleBooks(q, 12)
      setLookupResults(results)
      if (results.length === 0) setLookupError('未找到匹配书目，可改关键词或直接上传封面')
    } catch (e) {
      setLookupResults([])
      setLookupError(e instanceof Error ? e.message : '搜索失败')
    } finally {
      setLookupLoading(false)
    }
  }, [lookupQuery])

  function applyGoogleBooksHit(hit: GoogleBooksHit) {
    const cover = resolveGoogleBooksCoverUrl(hit)
    setForm((f) => ({
      ...f,
      title: hit.title,
      author: hit.authors.length ? hit.authors.join(' / ') : f.author,
      isbn: hit.isbns[0] ?? f.isbn,
      coverPreview: cover ?? f.coverPreview,
    }))
    setLookupDialogOpen(false)
    setCoverLightboxUrl(null)
    setErrors((e) => ({ ...e, title: undefined, author: undefined }))
  }

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // ── 进度/成功 页 ─────────────────────────────────────────────
  if (step !== 'form') {
    return (
      <div className="pb-28 md:pb-12">
        <div className="max-w-lg mx-auto px-5 sm:px-8 pt-10 flex flex-col items-center gap-6">
          {step === 'done' ? (
            <>
              <div className="w-20 h-20 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="text-primary">
                  <path d="M8 18l8 8 12-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">上架成功！</p>
                <p className="text-sm text-muted-foreground mt-2">《{form.title}》已铸造为 Solana NFT 并上架到市场</p>
              </div>
              <div className="w-full bg-card border border-border/60 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asset</span>
                  <span className="font-mono text-foreground truncate max-w-[65%] text-right">
                    {lastAsset ?? '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">定价</span>
                  <span className="text-primary font-mono font-semibold">{form.price} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">交易签名</span>
                  <span className="font-mono text-foreground truncate max-w-[65%] text-right">
                    {lastSignature ?? '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">网络</span>
                  <span className="text-yellow-400 text-xs px-2 py-0.5 bg-yellow-400/10 rounded-md">Devnet</span>
                </div>
              </div>
              <Button onClick={handleReset} className="w-full bg-primary text-primary-foreground h-11 rounded-xl font-semibold">
                继续上架
              </Button>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-card border border-border/60 flex items-center justify-center">
                <span className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-lg">
                  {step === 'building'
                    ? buildPhase || '准备中…'
                    : step === 'signing'
                      ? '等待钱包签名...'
                      : '链上铸造 NFT...'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {step === 'building'
                    ? '正在上传中，请不要关闭此页面'
                    : step === 'signing'
                      ? '请在钱包（Phantom / MetaMask）中确认签名弹窗'
                      : '正在 Solana Devnet 上铸造书籍 NFT'}
                </p>
              </div>
              <div className="w-full bg-card border border-border/60 rounded-2xl p-4 space-y-3">
                {(['building', 'signing', 'minting'] as const).map((s, i) => {
                  const done = (step === 'signing' && i === 0) || (step === 'minting' && i < 2)
                  const active = step === s
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className={[
                        'w-3 h-3 rounded-full border-2',
                        done ? 'bg-primary border-primary' : active ? 'border-primary border-t-transparent animate-spin' : 'border-border',
                      ].join(' ')} />
                      <span className={['text-sm', active || done ? 'text-foreground' : 'text-muted-foreground'].join(' ')}>
                        {i === 0
                          ? step === 'building' && buildPhase
                            ? buildPhase
                            : '上传元数据并构建交易'
                          : i === 1
                            ? '钱包签名'
                            : '链上铸造 NFT'}
                      </span>
                      {done && <span className="ml-auto text-[11px] text-primary">完成</span>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── 表单页 ───────────────────────────────────────────────────
  return (
    <div className="pb-28 md:pb-12">
      <div className="relative max-w-lg mx-auto px-5 sm:px-8 pt-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">{isRelistMode ? '转卖上架' : '上架书籍'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRelistMode ? '将复用原书 asset，调用转卖指令重新上架' : '填写信息后将铸造为 Solana NFT 上链出售'}
          </p>
        </div>

        <Dialog
          open={lookupDialogOpen}
          onOpenChange={(open) => {
            setLookupDialogOpen(open)
            if (!open) {
              setCoverLightboxUrl(null)
              setDetailZoomUrl(null)
            }
          }}
        >
          <DialogContent
            showCloseButton
            className="max-h-[min(90vh,760px)] w-[min(96vw,640px)] sm:max-w-2xl flex flex-col gap-0 p-0 gap-y-0 overflow-hidden border-border/60"
          >
            <div className="p-5 pb-3 border-b border-border/50 shrink-0">
              <DialogHeader className="space-y-1.5">
                <DialogTitle>从 Google Books 搜索</DialogTitle>
              </DialogHeader>
            </div>

            <div className="px-5 pt-4 flex gap-2 shrink-0">
              <input
                type="text"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), runGoogleBooksSearch())}
                placeholder="书名或关键词，例如：数学分析"
                className="flex-1 h-10 px-3 rounded-xl bg-input border border-border/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
              <Button
                type="button"
                className="h-10 rounded-xl px-4 shrink-0"
                disabled={lookupLoading}
                onClick={() => runGoogleBooksSearch()}
              >
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
              </Button>
            </div>

            <div className="flex-1 min-h-[200px] px-5 pb-5 pt-3 flex flex-col overflow-hidden">
              {lookupLoading && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
                  <p className="text-sm text-muted-foreground max-w-xs">
                    正在请求 Google Books…若失败请确认服务端已配置 GOOGLE_BOOKS_API_KEY。
                  </p>
                </div>
              )}
              {!lookupLoading && lookupError && (
                <p className="text-sm text-destructive py-2">{lookupError}</p>
              )}
              {!lookupLoading && lookupResults.length > 0 && (
                <div className="overflow-y-auto pr-1 -mr-1 max-h-[min(48vh,420px)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {lookupResults.map((hit, idx) => (
                      <LookupResultCard
                        key={`${hit.volume_id}-${idx}`}
                        hit={hit}
                        onPick={() => applyGoogleBooksHit(hit)}
                        onCoverZoom={(url) => setCoverLightboxUrl(url)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {!lookupLoading && lookupResults.length === 0 && !lookupError && (
                <p className="text-sm text-muted-foreground py-6 text-center">输入关键词后点击搜索。</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={coverLightboxUrl != null} onOpenChange={(o) => !o && setCoverLightboxUrl(null)}>
          <DialogContent
            className="max-w-[min(96vw,720px)] border-0 bg-transparent p-2 shadow-none sm:max-w-3xl [&>button]:text-white [&>button]:drop-shadow-md"
            showCloseButton
          >
            <DialogHeader className="sr-only">
              <DialogTitle>封面大图预览</DialogTitle>
              <DialogDescription>查看书籍封面原图</DialogDescription>
            </DialogHeader>
            {coverLightboxUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverLightboxUrl}
                alt="封面大图"
                className="w-full max-h-[min(85vh,640px)] object-contain rounded-lg mx-auto"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={detailZoomUrl != null} onOpenChange={(o) => !o && setDetailZoomUrl(null)}>
          <DialogContent
            className="max-w-[min(96vw,720px)] border-0 bg-transparent p-2 shadow-none sm:max-w-3xl [&>button]:text-white [&>button]:drop-shadow-md"
            showCloseButton
          >
            <DialogHeader className="sr-only">
              <DialogTitle>详情图大图预览</DialogTitle>
              <DialogDescription>查看书籍详情图片原图</DialogDescription>
            </DialogHeader>
            {detailZoomUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detailZoomUrl}
                alt="详情大图"
                className="w-full max-h-[min(85vh,640px)] object-contain rounded-lg mx-auto bg-black/20"
              />
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="max-w-[min(92vw,640px)]">
            <DialogHeader>
              <DialogTitle>上架信息核对</DialogTitle>
              <DialogDescription>
                请确认以下信息。上架成功后，除价格外其余信息默认不可修改。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <span className="text-muted-foreground">书名</span>
                <span className="text-foreground font-medium break-words">{form.title || '—'}</span>
                <span className="text-muted-foreground">作者</span>
                <span className="text-foreground break-words">{form.author || '—'}</span>
                <span className="text-muted-foreground">分类</span>
                <span className="text-foreground">{categoryOptions.find((c) => c.key === form.category)?.label ?? '—'}</span>
                <span className="text-muted-foreground">品相</span>
                <span className="text-foreground">{conditionOptions.find((c) => c.key === form.condition)?.label ?? '—'}</span>
                <span className="text-muted-foreground">封面/详情图</span>
                <span className="text-foreground">{coverFile ? '1' : '0'} / {detailImages.length}</span>
                <span className="text-muted-foreground">定价</span>
                <span className="text-foreground font-mono">
                  {priceNum.toFixed(6)} SOL
                  {cnyDraft.trim() ? `（¥${cnyDraft.trim()}）` : ''}
                </span>
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                />
                我已核对信息，确认上架后仅支持修改价格。
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
                返回修改
              </Button>
              <Button
                disabled={!confirmChecked}
                onClick={() => {
                  setConfirmDialogOpen(false)
                  void submitMintFlow()
                }}
              >
                确认并铸造
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-5">
          {/* ── 封面上传 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              书籍封面 <span className="text-destructive">*</span>
            </label>

            {/* 预览区 */}
            <div className="w-full h-44 rounded-2xl border-2 border-dashed border-border/60 bg-card overflow-hidden relative mb-2 group/cover">
              {form.coverPreview ? (
                <>
                  <button
                    type="button"
                    className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setCoverLightboxUrl(form.coverPreview)}
                    aria-label="放大查看封面"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.coverPreview}
                      alt="封面预览"
                      className="h-full w-full object-cover pointer-events-none"
                    />
                    <span className="pointer-events-none absolute bottom-2 left-1/2 z-[1] -translate-x-1/2 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover/cover:opacity-100">
                      点击查看大图
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCoverFile(null)
                      setForm((f) => ({ ...f, coverPreview: null }))
                    }}
                    className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-background"
                    aria-label="移除封面"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="text-foreground">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <rect x="3" y="7" width="26" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="21" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 22l7-6 5 5 4-3 10 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm">添加书籍封面</span>
                  <span className="text-xs">JPG / PNG / WebP / GIF，建议比例 3:4，≤ 3MB</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">封面最大 3MB，超限时会自动压缩并尽量保留清晰度。</p>

            {/* 按钮组 */}
            <div className={['flex gap-2', isMobile ? '' : 'justify-start'].join(' ')}>
              {/* 移动端：拍照按钮 */}
              {isMobile && (
                <MobileCameraButton onClick={() => coverCameraRef.current?.click()} disabled={imageProcessing}>
                  拍照
                </MobileCameraButton>
              )}
              {/* 通用：文件上传 */}
              <UploadActionButton
                onClick={() => coverFileRef.current?.click()}
                disabled={imageProcessing}
                mobileFlex={isMobile}
              >
                从相册上传
              </UploadActionButton>
              <Button
                type="button"
                variant="outline"
                className={['h-10 rounded-xl', isMobile ? 'flex-1' : 'px-6'].join(' ')}
                onClick={() => setLookupDialogOpen(true)}
                disabled={imageProcessing}
              >
                网上查找
              </Button>
            </div>
            {imageProcessing && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                上传图片中…
              </div>
            )}

            {/* 隐藏 input */}
            <input ref={coverFileRef} type="file" accept="image/*" className="sr-only" onChange={handleCoverFile} />
            <input ref={coverCameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleCoverFile} />
          </div>

          {/* ── 详情图（与后端 detail_images 对应，上架时一并提交） ── */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <label className="block text-sm font-medium text-foreground">
                详情图片 <span className="text-destructive">*</span>
              </label>
              <span className="text-xs text-muted-foreground">
                至少 {MIN_DETAIL_IMAGES} 张，最多 {MAX_DETAIL_IMAGES} 张 · 已选 {detailImages.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">展示品相、版权页、目录等，便于买家下单前核对。</p>
            <p className="text-[11px] text-muted-foreground mb-2">单张详情图最大 5MB，超限时会自动压缩并尽量保留清晰度。</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 mb-2">
              {detailImages.map((d) => (
                <div key={d.id} className="relative aspect-square rounded-lg overflow-hidden border border-border/60 bg-muted">
                  <button
                    type="button"
                    className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setDetailZoomUrl(d.preview)}
                    aria-label="放大查看详情图"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.preview} alt="" className="h-full w-full object-cover pointer-events-none" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDetailImage(d.id)
                    }}
                    className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-xs text-foreground shadow-sm hover:bg-background"
                    aria-label="移除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className={['flex gap-2', isMobile ? '' : ''].join(' ')}>
              {isMobile && (
                <MobileCameraButton
                  onClick={() => detailCameraRef.current?.click()}
                  disabled={detailImages.length >= MAX_DETAIL_IMAGES || imageProcessing}
                >
                  {imageProcessing ? '上传图片中…' : detailImages.length >= MAX_DETAIL_IMAGES ? '已达上限' : '拍照'}
                </MobileCameraButton>
              )}
              <UploadActionButton
                onClick={() => detailFilesRef.current?.click()}
                disabled={detailImages.length >= MAX_DETAIL_IMAGES || imageProcessing}
                mobileFlex={isMobile}
              >
                {imageProcessing
                  ? '上传图片中…'
                  : detailImages.length >= MAX_DETAIL_IMAGES
                    ? '已达上限'
                    : '添加详情图'}
              </UploadActionButton>
            </div>
            <input
              ref={detailFilesRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={handleDetailFilesChange}
            />
            <input
              ref={detailCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleDetailFilesChange}
            />
          </div>

          {/* ── 书名 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              书名 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="例：三体（全三册）"
              className={[
                'w-full h-11 px-3.5 rounded-xl bg-input border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow',
                errors.title ? 'border-destructive' : 'border-border/60',
              ].join(' ')}
            />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
          </div>

          {/* ── 作者 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              作者 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={form.author}
              onChange={(e) => set('author', e.target.value)}
              placeholder="例：刘慈欣"
              className={[
                'w-full h-11 px-3.5 rounded-xl bg-input border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow',
                errors.author ? 'border-destructive' : 'border-border/60',
              ].join(' ')}
            />
            {errors.author && <p className="text-xs text-destructive mt-1">{errors.author}</p>}
          </div>

          {/* ── ISBN（移动端有拍照扫码，PC 端只有文本输入） ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">ISBN（选填）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.isbn}
                onChange={(e) => set('isbn', e.target.value)}
                placeholder="978-7-xxx-xxxxx-x"
                className="flex-1 h-11 px-3.5 rounded-xl bg-input border border-border/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 font-mono transition-shadow"
              />
              {/* 仅移动端显示拍照扫码按钮 */}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => isbnCameraRef.current?.click()}
                  className="shrink-0 w-11 h-11 rounded-xl border border-border/60 bg-card flex items-center justify-center hover:border-primary/40 transition-colors active:scale-95"
                  aria-label="拍照扫描 ISBN"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-primary">
                    <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 10v4M7 9v6M9 10v4M11 9v6M13 10v4M15 9v6M17 10v4M19 10v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {isMobile && (
              <p className="text-[11px] text-muted-foreground mt-1">点击右侧条形码图标，拍照自动识别 ISBN</p>
            )}
            <input ref={isbnFileRef} type="file" accept="image/*" className="sr-only" onChange={handleIsbnPhoto} />
            <input ref={isbnCameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleIsbnPhoto} />
          </div>

          {/* ── 分类（来自 book_categories 表） ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              分类 <span className="text-destructive">*</span>
            </label>
            {categoriesError && (
              <p className="text-xs text-destructive mb-2">{categoriesError}</p>
            )}
            {categoriesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载分类…
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {categoryOptions.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => set('category', c.key)}
                    className={[
                      'py-2.5 px-1 rounded-xl text-xs font-medium border transition-colors text-center leading-tight',
                      form.category === c.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30',
                    ].join(' ')}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {errors.category && <p className="text-xs text-destructive mt-1">{errors.category}</p>}
          </div>

          {/* ── 品相（来自 book_conditions 表） ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              品相 <span className="text-destructive">*</span>
            </label>
            {conditionsError && (
              <p className="text-xs text-destructive mb-2">{conditionsError}</p>
            )}
            {conditionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载品相…
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {conditionOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => set('condition', opt.key)}
                    className={[
                      'flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-colors',
                      form.condition === opt.key
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card border-border/60 hover:border-border',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'text-sm font-medium',
                        form.condition === opt.key ? 'text-primary' : 'text-foreground',
                      ].join(' ')}
                    >
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted-foreground text-right max-w-[58%]">
                      {opt.description ?? ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {errors.condition && <p className="text-xs text-destructive mt-1">{errors.condition}</p>}
          </div>

          {/* ── 书籍描述（必填） ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              书籍描述 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="请描述版本、品相细节、缺页污渍、是否笔记、附件等，便于买家决策。"
              rows={4}
              className={[
                'w-full px-3.5 py-3 rounded-xl bg-input border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y min-h-[100px] leading-relaxed transition-shadow',
                errors.description ? 'border-destructive' : 'border-border/60',
              ].join(' ')}
            />
            {errors.description && <p className="text-xs text-destructive mt-1">{errors.description}</p>}
          </div>

          {/* ── 定价：默认人民币，换算 SOL / lamports（链上仍以 SOL 为准） ── */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-medium text-foreground">
                定价 <span className="text-destructive">*</span>
              </label>
              <div className="flex rounded-lg border border-border/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => togglePriceMode('cny')}
                  className={[
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    priceMode === 'cny'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  人民币
                </button>
                <button
                  type="button"
                  onClick={() => togglePriceMode('sol')}
                  className={[
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    priceMode === 'sol'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  SOL
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {rateLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  正在获取 SOL/人民币汇率…
                </span>
              ) : cnyPerSol != null ? (
                <>
                  <span>
                    参考汇率：1 SOL ≈ ¥{cnyPerSol.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
                    {rateSource === 'coingecko' ? '（CoinGecko 现货）' : '（环境变量备用）'}
                  </span>
                  {rateUpdatedAt != null && (
                    <span className="text-muted-foreground/80">
                      更新 {new Date(rateUpdatedAt).toLocaleString('zh-CN')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void refreshRate()}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground/90 hover:bg-muted"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    刷新
                  </button>
                </>
              ) : null}
            </div>
            {rateError && (
              <p className="text-xs text-amber-600 dark:text-amber-500/90">{rateError}</p>
            )}
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              汇率随时波动，页面所示换算<strong className="text-foreground/90">仅代表当前参考时刻</strong>
              ，链上成交以 SOL（lamports）为准。
            </div>

            {priceMode === 'cny' ? (
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!cnyPerSol || rateLoading}
                  value={cnyDraft}
                  onChange={(e) => setCnyDraft(e.target.value)}
                  placeholder={cnyPerSol ? '例如 88.00' : '等待汇率…'}
                  className={[
                    'w-full h-11 pl-3.5 pr-12 rounded-xl bg-input border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow',
                    errors.price ? 'border-destructive' : 'border-border/60',
                    (!cnyPerSol || rateLoading) && 'opacity-60',
                  ].join(' ')}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  CNY
                </span>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  min="0.000001"
                  max="100"
                  step="0.000001"
                  value={form.price}
                  onChange={(e) => {
                    const raw = e.target.value
                    set('price', raw)
                    const s = Number.parseFloat(raw)
                    if (cnyPerSol && Number.isFinite(s) && s > 0) {
                      setCnyDraft((s * cnyPerSol).toFixed(2))
                    } else if (!raw.trim()) setCnyDraft('')
                  }}
                  placeholder="0.000000"
                  className={[
                    'w-full h-11 pl-3.5 pr-16 rounded-xl bg-input border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 font-mono transition-shadow',
                    errors.price ? 'border-destructive' : 'border-border/60',
                  ].join(' ')}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                  SOL
                </span>
              </div>
            )}

            {priceNum > 0 && cnyPerSol != null && (
              <div className="rounded-xl border border-border/50 bg-card/60 px-3 py-2.5 text-xs space-y-1.5">
                <div className="flex justify-between gap-2 text-muted-foreground">
                  <span>约合 SOL（提交链上）</span>
                  <span className="font-mono text-foreground">{priceNum.toFixed(6)} SOL</span>
                </div>
                <div className="flex justify-between gap-2 text-muted-foreground">
                  <span>约合 lamports（整数）</span>
                  <span className="font-mono text-foreground break-all text-right">
                    {lamportsDisplay?.toLocaleString('zh-CN') ?? '—'}
                  </span>
                </div>
              </div>
            )}

            {errors.price && <p className="text-xs text-destructive mt-1">{errors.price}</p>}
            {priceNum > 0 && (
              <div className="mt-2.5 bg-secondary/50 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>平台手续费 (2%)</span>
                  <span className="font-mono">-{platformFee.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border/50 pt-1.5">
                  <span className="text-foreground">你将收到</span>
                  <span className="text-primary font-mono">{youReceive.toFixed(4)} SOL</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Devnet 提示 ── */}
          <div className="flex items-start gap-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-3.5 text-xs text-muted-foreground">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-yellow-400 shrink-0 mt-0.5" aria-hidden="true">
              <path d="M7.5 2L13.5 12H1.5L7.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M7.5 6v3M7.5 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>当前为 <strong className="text-yellow-400">Devnet</strong> 测试网络，所有交易使用测试 SOL，不涉及真实资产。上架操作将铸造 NFT 并写入链上。</span>
          </div>

          {submitError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </div>
          )}

          {/* ── 提交 ── */}
          <Button
            onClick={handleSubmit}
            disabled={relistPrefillLoading}
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:opacity-90 transition-opacity"
          >
            {publicKey ? (isRelistMode ? '确认转卖上架' : '铸造 NFT 并上架') : '连接钱包以上架'}
          </Button>
        </div>
        {relistPrefillLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-4 py-2 text-sm text-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              加载原信息中...
            </div>
          </div>
        )}
      </div>
      {duplicateHintOpen && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur">
          你已经上传过该图片了
        </div>
      )}
    </div>
  )
}
