'use client'

import { useState, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useOpenWalletConnect } from '@/lib/hooks/use-open-wallet-connect'
import { BookCategory, BookCondition } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'

const CATEGORIES: BookCategory[] = [
  '文学小说', '科学技术', '历史文化', '艺术设计',
  '教育学习', '商业经济', '科幻奇幻', '其他',
]

const CONDITIONS: BookCondition[] = ['全新', '近全新', '良好', '一般', '较差']

const CONDITION_DESCS: Record<BookCondition, string> = {
  '全新': '未使用，无任何痕迹',
  '近全新': '轻微使用，几乎无痕迹',
  '良好': '正常翻阅痕迹，无破损',
  '一般': '有笔记或折角，不影响阅读',
  '较差': '明显破损，仍可阅读',
}

interface FormState {
  title: string
  author: string
  isbn: string
  category: BookCategory | ''
  condition: BookCondition | ''
  price: string
  description: string
  coverPreview: string | null
}

const INITIAL_FORM: FormState = {
  title: '', author: '', isbn: '', category: '', condition: '',
  price: '', description: '', coverPreview: null,
}

const PLATFORM_FEE_RATE = 0.025

export function ListBookPage() {
  const { publicKey } = useWallet()
  const openWalletConnect = useOpenWalletConnect()
  const isMobile = useIsMobile()

  // 封面相关 refs
  const coverFileRef = useRef<HTMLInputElement>(null)
  const coverCameraRef = useRef<HTMLInputElement>(null)
  // ISBN 相关 refs
  const isbnFileRef = useRef<HTMLInputElement>(null)
  const isbnCameraRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [step, setStep] = useState<'form' | 'signing' | 'minting' | 'done'>('form')
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const priceNum = parseFloat(form.price) || 0
  const platformFee = priceNum * PLATFORM_FEE_RATE
  const youReceive = priceNum - platformFee

  function validate() {
    const e: typeof errors = {}
    if (!form.title.trim()) e.title = '请填写书名'
    if (!form.author.trim()) e.author = '请填写作者'
    if (!form.category) e.category = '请选择分类'
    if (!form.condition) e.condition = '请选择品相'
    if (!form.price || isNaN(priceNum) || priceNum <= 0) e.price = '请输入有效价格'
    if (priceNum > 100) e.price = '价格不能超过 100 SOL'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function readFile(file: File, cb: (dataUrl: string) => void) {
    const reader = new FileReader()
    reader.onload = (ev) => cb(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readFile(file, (url) => setForm((f) => ({ ...f, coverPreview: url })))
    e.target.value = ''
  }

  function handleIsbnPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    // 实际项目中这里可接 OCR API 解析 ISBN；目前仅做填充提示
    const file = e.target.files?.[0]
    if (!file) return
    // 模拟扫描：填入示例 ISBN
    setForm((f) => ({ ...f, isbn: '978-7-536-69264-6' }))
    e.target.value = ''
  }

  async function handleSubmit() {
    if (!publicKey) { openWalletConnect(); return }
    if (!validate()) return
    setStep('signing')
    await new Promise((r) => setTimeout(r, 1500))
    setStep('minting')
    await new Promise((r) => setTimeout(r, 2000))
    setStep('done')
  }

  function handleReset() {
    setForm(INITIAL_FORM)
    setErrors({})
    setStep('form')
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
                  <span className="text-muted-foreground">Token ID</span>
                  <span className="font-mono text-foreground">BCK-{Math.floor(Math.random() * 900 + 100)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">定价</span>
                  <span className="text-primary font-mono font-semibold">{form.price} SOL</span>
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
                  {step === 'signing' ? '等待钱包签名...' : '链上铸造 NFT...'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {step === 'signing' ? '请在 Phantom / Solflare 中确认签名' : '正在 Solana Devnet 上铸造书籍 NFT'}
                </p>
              </div>
              <div className="w-full bg-card border border-border/60 rounded-2xl p-4 space-y-3">
                {(['signing', 'minting'] as const).map((s, i) => {
                  const done = (step === 'minting' && i === 0)
                  const active = step === s
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className={[
                        'w-3 h-3 rounded-full border-2',
                        done ? 'bg-primary border-primary' : active ? 'border-primary border-t-transparent animate-spin' : 'border-border',
                      ].join(' ')} />
                      <span className={['text-sm', active || done ? 'text-foreground' : 'text-muted-foreground'].join(' ')}>
                        {i === 0 ? '钱包签名' : '链上铸造 NFT'}
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
      <div className="max-w-lg mx-auto px-5 sm:px-8 pt-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">上架书籍</h1>
          <p className="text-sm text-muted-foreground mt-0.5">填写信息后将铸造为 Solana NFT 上链出售</p>
        </div>

        <div className="space-y-5">
          {/* ── 封面上传 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">书籍封面</label>

            {/* 预览区 */}
            <div className="w-full h-44 rounded-2xl border-2 border-dashed border-border/60 bg-card overflow-hidden relative mb-2">
              {form.coverPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.coverPreview} alt="封面预览" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, coverPreview: null }))}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors"
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
                  <span className="text-xs">JPG / PNG，建议比例 3:4</span>
                </div>
              )}
            </div>

            {/* 按钮组 */}
            <div className={['flex gap-2', isMobile ? '' : 'justify-start'].join(' ')}>
              {/* 移动端：拍照按钮 */}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => coverCameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-border/60 bg-card text-sm text-foreground hover:border-primary/40 transition-colors active:scale-95"
                >
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-primary">
                    <path d="M7.5 3.5h5l1.5 2.5H17a1 1 0 011 1V16a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1h3L7.5 3.5z"
                      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <circle cx="10" cy="11" r="2.8" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  拍照
                </button>
              )}
              {/* 通用：文件上传 */}
              <button
                type="button"
                onClick={() => coverFileRef.current?.click()}
                className={[
                  'flex items-center justify-center gap-2 h-10 rounded-xl border border-border/60 bg-card text-sm text-foreground hover:border-primary/40 transition-colors active:scale-95',
                  isMobile ? 'flex-1' : 'px-6',
                ].join(' ')}
              >
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-muted-foreground">
                  <path d="M10 3v10M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                从相册上传
              </button>
            </div>

            {/* 隐藏 input */}
            <input ref={coverFileRef} type="file" accept="image/*" className="sr-only" onChange={handleCoverFile} />
            <input ref={coverCameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleCoverFile} />
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

          {/* ── 分类 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              分类 <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => set('category', cat)}
                  className={[
                    'py-2 rounded-xl text-xs font-medium border transition-colors',
                    form.category === cat
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30',
                  ].join(' ')}
                >
                  {cat}
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-destructive mt-1">{errors.category}</p>}
          </div>

          {/* ── 品相 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              品相 <span className="text-destructive">*</span>
            </label>
            <div className="flex flex-col gap-2">
              {CONDITIONS.map((cond) => (
                <button
                  key={cond}
                  type="button"
                  onClick={() => set('condition', cond)}
                  className={[
                    'flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-colors',
                    form.condition === cond
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card border-border/60 hover:border-border',
                  ].join(' ')}
                >
                  <span className={['text-sm font-medium', form.condition === cond ? 'text-primary' : 'text-foreground'].join(' ')}>
                    {cond}
                  </span>
                  <span className="text-xs text-muted-foreground">{CONDITION_DESCS[cond]}</span>
                </button>
              ))}
            </div>
            {errors.condition && <p className="text-xs text-destructive mt-1">{errors.condition}</p>}
          </div>

          {/* ── 定价 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              定价 (SOL) <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                type="number" min="0.001" max="100" step="0.001"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="0.000"
                className={[
                  'w-full h-11 pl-3.5 pr-16 rounded-xl bg-input border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 font-mono transition-shadow',
                  errors.price ? 'border-destructive' : 'border-border/60',
                ].join(' ')}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">SOL</span>
            </div>
            {errors.price && <p className="text-xs text-destructive mt-1">{errors.price}</p>}
            {priceNum > 0 && (
              <div className="mt-2.5 bg-secondary/50 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>平台手续费 (2.5%)</span>
                  <span className="font-mono">-{platformFee.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border/50 pt-1.5">
                  <span className="text-foreground">你将收到</span>
                  <span className="text-primary font-mono">{youReceive.toFixed(4)} SOL</span>
                </div>
              </div>
            )}
          </div>

          {/* ── 描述 ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">书籍描述（选填）</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="描述书籍状态、版本、附赠内容等..."
              rows={3}
              className="w-full px-3.5 py-3 rounded-xl bg-input border border-border/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none leading-relaxed transition-shadow"
            />
          </div>

          {/* ── Devnet 提示 ── */}
          <div className="flex items-start gap-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-3.5 text-xs text-muted-foreground">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-yellow-400 shrink-0 mt-0.5" aria-hidden="true">
              <path d="M7.5 2L13.5 12H1.5L7.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M7.5 6v3M7.5 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>当前为 <strong className="text-yellow-400">Devnet</strong> 测试网络，所有交易使用测试 SOL，不涉及真实资产。上架操作将铸造 NFT 并写入链上。</span>
          </div>

          {/* ── 提交 ── */}
          <Button
            onClick={handleSubmit}
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:opacity-90 transition-opacity"
          >
            {publicKey ? '铸造 NFT 并上架' : '连接钱包以上架'}
          </Button>
        </div>
      </div>
    </div>
  )
}
