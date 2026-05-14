import { apiFetch } from '@/lib/api/client'
import type { CurrentUser } from '@/lib/api/auth'

export async function updateMyProfile(input: {
  username?: string | null
  avatar?: string | null
}) {
  const body: Record<string, unknown> = {}
  if ('username' in input) body.username = input.username ?? null
  if ('avatar' in input) body.avatar = input.avatar ?? null
  return apiFetch<CurrentUser>('/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type QiniuAvatarClaim = {
  token: string
  key: string
  upload_url: string
  public_url: string
}

/** 向服务端申请七牛头像上传凭证（需服务端配置 QINIU_* 环境变量）。 */
export async function claimQiniuAvatarUpload(mimeType: string) {
  return apiFetch<QiniuAvatarClaim>('/me/upload/qiniu-avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mime_type: mimeType }),
  })
}

/** 浏览器直传七牛；成功后用返回的 `public_url` 调 `updateMyProfile({ avatar })`。 */
export async function uploadAvatarFileToQiniu(claim: QiniuAvatarClaim, file: File) {
  const fd = new FormData()
  fd.append('token', claim.token)
  fd.append('key', claim.key)
  fd.append('file', file)
  const res = await fetch(claim.upload_url, { method: 'POST', body: fd })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    let detail = t.trim()
    try {
      const j = JSON.parse(t) as { error?: string }
      if (j?.error) detail = j.error
    } catch {
      /* 非 JSON */
    }
    throw new Error(detail || `上传失败（HTTP ${res.status}）`)
  }
  return claim.public_url
}
