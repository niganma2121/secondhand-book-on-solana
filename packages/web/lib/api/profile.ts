import { apiFetch } from '@/lib/api/client'
import type { CurrentUser } from '@/lib/api/auth'

export async function updateMyProfile(input: {
  username?: string | null
  avatar?: string | null
}) {
  return apiFetch<CurrentUser>('/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username ?? null,
      avatar: input.avatar ?? null,
    }),
  })
}
