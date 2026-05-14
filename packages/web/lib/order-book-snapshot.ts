import type { BookDetailDto, BookDetailResponse, BookImageDto } from '@/lib/api/book-detail'

/** 已结束订单：用托管表里冻结的快照展示书目 */
export function isOrderTerminalForBookSnapshot(state: string): boolean {
  return state === 'Cancelled' || state === 'Released'
}

/** 将 `escrows.book_snapshot`（见 book_server build_escrow_book_snapshot）转为详情接口形状，仅用于只读展示 */
export function escrowBookSnapshotToDetailResponse(snap: unknown): BookDetailResponse | null {
  if (!snap || typeof snap !== 'object') return null
  const o = snap as Record<string, unknown>
  const asset = typeof o.asset === 'string' ? o.asset : ''
  if (!asset) return null

  const captured =
    typeof o.captured_at === 'number'
      ? o.captured_at
      : typeof o.captured_at === 'string'
        ? Number.parseInt(String(o.captured_at), 10)
        : 0

  const imagesRaw = Array.isArray(o.images) ? o.images : []
  const images: BookImageDto[] = imagesRaw
    .map((row, i) => {
      if (typeof row === 'string') {
        const url = row.trim()
        if (!url) return null
        return {
          id: i,
          asset,
          url,
          sort: i,
          created_at: Number.isFinite(captured) ? captured : 0,
        }
      }
      const r = row as Record<string, unknown>
      const id = typeof r.id === 'number' ? r.id : Number(r.id) || i
      const url = typeof r.url === 'string' ? r.url : ''
      const sort = typeof r.sort === 'number' ? r.sort : Number(r.sort) || i
      return {
        id,
        asset,
        url,
        sort,
        created_at: Number.isFinite(captured) ? captured : 0,
      }
    })
    .filter((x): x is BookImageDto => Boolean(x && x.url))

  const priceLamports =
    typeof o.price_lamports === 'number'
      ? o.price_lamports
      : typeof o.price_lamports === 'string'
        ? Number.parseInt(String(o.price_lamports), 10)
        : 0

  const book: BookDetailDto = {
    asset,
    collection: '',
    seller: typeof o.seller === 'string' ? o.seller : '',
    price: Number.isFinite(priceLamports) ? priceLamports : 0,
    price_cny: typeof o.price_cny === 'number' ? o.price_cny : null,
    fx_cny_per_sol: typeof o.fx_cny_per_sol === 'number' ? o.fx_cny_per_sol : null,
    status:
      typeof o.book_status_at_capture === 'string' && o.book_status_at_capture.trim()
        ? o.book_status_at_capture
        : 'Listed',
    name: typeof o.name === 'string' ? o.name : '',
    metadata_url: typeof o.metadata_url === 'string' ? o.metadata_url : '',
    cover_url: typeof o.cover_url === 'string' ? o.cover_url : null,
    author: typeof o.author === 'string' ? o.author : null,
    series: typeof o.series === 'string' ? o.series : null,
    category: typeof o.category === 'string' ? o.category : '',
    condition: typeof o.condition === 'string' ? o.condition : '',
    created_at: Number.isFinite(captured) ? captured : 0,
  }

  return { book, images }
}
