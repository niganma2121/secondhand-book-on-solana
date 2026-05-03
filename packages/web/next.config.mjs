import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Yarn workspace 下 `next` 在仓库根 node_modules；仅在使用 `yarn dev:turbo` 时需要。
   */
  turbopack: {
    root: repoRoot,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
