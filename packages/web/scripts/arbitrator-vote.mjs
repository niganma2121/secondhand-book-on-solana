#!/usr/bin/env node
/**
 * 仲裁员离线投票：用 solana-keygen 生成的 JSON keypair 签名 resolve_dispute，并广播。
 *
 * 前置：在站点用**同一公钥**完成登录，将返回的 JWT 写入环境变量（浏览器 DevTools → Application → Local Storage → bookchain_access_token）。
 *
 * 在 packages/web 目录执行（以便解析 @solana/web3.js）：
 *
 *   cd packages/web
 *   API_URL=http://127.0.0.1:3005/api JWT=eyJ... KEYPAIR=$HOME/arb1.json \\
 *   node scripts/arbitrator-vote.mjs \\
 *     --escrow-pda <PDA> --buyer <pk> --seller <pk> --asset <asset> --collection <col> \\
 *     --choice 1 --refund-lamports 0 --return-book false
 *
 * --choice: 1 = 支持买家, 2 = 支持卖家
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(__dirname, '..')
const require = createRequire(import.meta.url)
const { Keypair, Transaction } = require(require.resolve('@solana/web3.js', { paths: [pkgRoot] }))

function getArg(name, fallback = '') {
  const i = process.argv.indexOf(name)
  if (i === -1 || !process.argv[i + 1]) return fallback
  return process.argv[i + 1]
}

function flag(name) {
  const v = getArg(name, 'false').toLowerCase()
  return v === 'true' || v === '1'
}

async function main() {
  const apiUrl = (process.env.API_URL || '').replace(/\/$/, '')
  const jwt = process.env.JWT || ''
  const kpPath = process.env.KEYPAIR || ''
  if (!apiUrl || !jwt || !kpPath) {
    console.error('请设置 API_URL（含 /api）、JWT、KEYPAIR')
    process.exit(1)
  }

  const escrow_pda = getArg('--escrow-pda')
  const buyer = getArg('--buyer')
  const seller = getArg('--seller')
  const asset = getArg('--asset')
  const collection = getArg('--collection')
  const choice = Number.parseInt(getArg('--choice', '1'), 10)
  const refund_lamports = Number.parseInt(getArg('--refund-lamports', '0'), 10)
  const return_book = flag('--return-book')

  if (!escrow_pda || !buyer || !seller || !asset || !collection || ![1, 2].includes(choice)) {
    console.error('缺少参数，见脚本顶部注释')
    process.exit(1)
  }

  const secret = JSON.parse(fs.readFileSync(path.resolve(kpPath), 'utf8'))
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret))
  const arbitrator = keypair.publicKey.toBase58()
  console.error('仲裁员公钥:', arbitrator)

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
  }

  const buildUrl = `${apiUrl}/escrow/resolve`
  const buildRes = await fetch(buildUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      arbitrator,
      buyer,
      seller,
      asset,
      collection,
      choice,
      refund_amount: refund_lamports,
      return_book,
    }),
  })
  const buildText = await buildRes.text()
  if (!buildRes.ok) {
    console.error('build 失败', buildRes.status, buildText)
    process.exit(1)
  }
  const { tx: txB64 } = JSON.parse(buildText)

  const tx = Transaction.from(Buffer.from(txB64, 'base64'))
  tx.partialSign(keypair)

  const signedB64 = Buffer.from(
    tx.serialize({ requireAllSignatures: true, verifySignatures: true }),
  ).toString('base64')

  const bcUrl = `${apiUrl}/escrow/resolve/broadcast`
  const bcRes = await fetch(bcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      signed_tx: signedB64,
      escrow_pda,
      asset,
      seller,
      buyer,
      choice,
    }),
  })
  const bcText = await bcRes.text()
  if (!bcRes.ok) {
    console.error('broadcast 失败', bcRes.status, bcText)
    process.exit(1)
  }
  console.log(bcText)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
