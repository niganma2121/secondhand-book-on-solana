/**
 * 将头像压成 JPEG、限制最大边，减小上传体积（画布在浏览器内完成）。
 * 失败时返回原文件，不阻断上传。
 */
export async function compressAvatarImage(
  file: File,
  opts?: { maxEdge?: number; quality?: number },
): Promise<File> {
  const maxEdge = opts?.maxEdge ?? 512
  const quality = opts?.quality ?? 0.82
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file).catch(() => null)
    if (!bitmap) return file
    const w = bitmap.width
    const h = bitmap.height
    if (w <= 0 || h <= 0) {
      bitmap.close()
      return file
    }
    const scale = Math.min(1, maxEdge / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, tw, th)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    )
    if (!blob || blob.size === 0) return file
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
