import type { BookCategory, BookCondition } from '@/lib/types'

/**
 * 仅用于 mock 数据 / 无 API 时的分类 key → 中文（与 `book_categories` 种子一致）。
 * 正式环境分类请以 `GET /books/categories` 为准。
 */
export const BOOK_CATEGORY_FALLBACK: { key: string; label: BookCategory }[] = [
  { key: 'literature', label: '文学小说' },
  { key: 'scifi', label: '科幻奇幻' },
  { key: 'science', label: '科学技术' },
  { key: 'business', label: '商业经济' },
  { key: 'history', label: '历史文化' },
  { key: 'art', label: '艺术设计' },
  { key: 'education', label: '教育学习' },
  { key: 'other', label: '其他' },
]

/** 英文 key → 中文（列表接口若未 JOIN 到字典时的兜底；正式展示优先走库表 label） */
export const CONDITION_DB_TO_ZH: Record<string, BookCondition> = {
  New: '全新',
  LikeNew: '近全新',
  Good: '良好',
  Fair: '一般',
  Poor: '较差',
}
