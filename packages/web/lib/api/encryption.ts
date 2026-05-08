import { apiFetch } from '@/lib/api/client'

export type EncryptionTemplate = {
  version: string
  message_template: string
  kdf_name: string
  kdf_params: Record<string, unknown>
}

export type EncryptionTemplatesResponse = {
  templates: EncryptionTemplate[]
}

export type MyEncryptionBackup = {
  pubkey: string
  backup_version: string
  encrypted_private_key: string
  nonce: string
  kdf_salt: string
  kdf_params: Record<string, unknown>
  updated_at: number
}

export type UpsertEncryptionBackupInput = {
  backup_version: string
  encryption_public_key: string
  encrypted_private_key: string
  nonce: string
  kdf_salt: string
  kdf_params: Record<string, unknown>
}

export async function fetchEncryptionTemplates() {
  return apiFetch<EncryptionTemplatesResponse>('/encryption/templates')
}

export async function fetchMyEncryptionBackup() {
  return apiFetch<MyEncryptionBackup>('/me/encryption-backup')
}

export async function upsertMyEncryptionBackup(input: UpsertEncryptionBackupInput) {
  return apiFetch<{ msg: string }>('/me/encryption-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function fetchUserEncryptionPublicKey(pubkey: string) {
  return apiFetch<{ pubkey: string; encryption_public_key: string | null; configured?: boolean }>(
    `/users/${encodeURIComponent(pubkey)}/encryption-pubkey`,
  )
}
