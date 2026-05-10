import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** 局域网用手机等设备访问 dev 时允许 HMR 等跨域资源（否则 webpack-hmr 会被拦截） */
  allowedDevOrigins: ['10.141.210.224'],
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
