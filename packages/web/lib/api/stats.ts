import { apiFetch } from '@/lib/api/client'

export type OverviewStatsResponse = {
  books_on_sale: number
  chain_transactions: number
  registered_users: number
  total_volume_sol: number
}

/** GET /api/stats/overview */
export async function fetchOverviewStats() {
  return apiFetch<OverviewStatsResponse>('/stats/overview')
}
