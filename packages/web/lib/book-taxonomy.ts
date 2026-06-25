import type { BookCategory, BookCondition } from '@/lib/types'

/**
 * 仅用于 mock 数据 / 无 API 时的分类 key → 中文（与 `book_categories` 种子一致）。
 * 正式环境分类请以 `GET /books/categories` 为准。
 *
 * 按大学公共课与校园二手常见学科划分（数学、英语、计算机等）。
 */
export const BOOK_CATEGORY_FALLBACK: { key: string; label: BookCategory }[] = [
  { key: 'math', label: '数学' },
  { key: 'english', label: '英语' },
  { key: 'computer', label: '计算机' },
  { key: 'physics', label: '物理' },
  { key: 'chemistry', label: '化学' },
  { key: 'biology', label: '生物' },
  { key: 'politics', label: '思想政治' },
  { key: 'economics_mgmt', label: '经管' },
  { key: 'law', label: '法学' },
  { key: 'literature', label: '文学·语文' },
  { key: 'history', label: '历史' },
  { key: 'engineering', label: '工学' },
  { key: 'medicine', label: '医学' },
  { key: 'arts', label: '艺术' },
  { key: 'agriculture', label: '农学' },
  { key: 'education', label: '教育学' },
  { key: 'philosophy', label: '哲学' },
  { key: 'exam_prep', label: '考研·考证' },
  { key: 'leisure', label: '课外读物' },
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
