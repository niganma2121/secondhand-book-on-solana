# BookChain

> 基于 Solana 区块链的去中心化二手书交易平台

链上托管 · NFT 资产化 · 端到端加密聊天 · 去中心化仲裁

---

## 项目简介

BookChain 是基于Solana区块链的全栈去中心化应用，买卖双方通过钱包签名完成身份验证，书籍以 NFT 形式上链，交易资金由智能合约托管，无需信任任何中间方。发生纠纷时由链上仲裁员多签裁决，过程完全透明可审计。

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 链上程序 | Anchor 0.31 · Solana · Metaplex Core |
| 后端 | Rust · Axum · SQLx · PostgreSQL · Redis · Tokio |
| 前端 | React · TypeScript · Tailwind CSS · shadcn/ui · Solana Wallet Adapter |
| 存储 | Pinata / IPFS· 七牛云 OSS |
| 其他 | Google Books API · 实时汇率（SOL/CNY）· Sonyflake 分布式 ID |

---

## 功能模块

### 链上程序（Anchor）

| 指令 | 说明 |
|------|------|
| `create_book` | 铸造书籍 NFT，元数据哈希上链防篡改 |
| `update_book_price` | 卖家修改售价 |
| `relist_book` | 重新上架，支持更新元数据 |
| `delist_book` | 下架书籍 |
| `create_escrow` | 买家付款，资金进入链上托管 |
| `set_pre_ship_lock` | 冻结 NFT，进入发货准备状态 |
| `ship_book` | 提交发货承诺哈希（Commit-Reveal 隐私方案） |
| `confirm_escrow` | 买家确认收货，资金释放给卖家，NFT 转移 |
| `cancel_escrow` | 取消交易，资金退回买家 |
| `open_dispute` | 发起仲裁 |
| `resolve_dispute` | 仲裁员多签裁决，支持部分退款与书籍退回 |

### 后端

- **鉴权**：SIWS（Sign In With Solana）钱包签名 + Nonce（Redis 消费防重放）+ JWT（黑名单机制支持主动登出）
- **书籍**：上架/下架/改价/搜索，PostgreSQL GIN 全文索引（tsvector + 自动更新触发器）+ pg_trgm 模糊搜索
- **聊天**：WebSocket 实时通信，X25519 ECDH 协商会话密钥，AES-GCM 端到端加密，支持图片、BookOffer 报价单、已读回执
- **链上同步**：定时对账链上状态与数据库一致性；WebSocket 订阅监听仲裁结果事件
- **仲裁**：证据提交、加密运单号上链、纠纷状态跟踪
- **其他**：Google Books API 辅助录入、实时 SOL/CNY 汇率、图片 multipart 上传 + 压缩、七牛云 OSS 集成

### 前端

- Phantom / 多钱包适配（Solana Wallet Adapter）
- 市场页：书籍列表、多维筛选（类目/品相/价格）、收藏
- 书架页：我卖的 / 我买的 / 交易进度跟踪
- 聊天页：实时会话列表 + 消息流
- 仲裁台：证据提交、仲裁简报查看
- 移动端适配：底部 Tab 导航 + 响应式布局

---

## 项目结构

```
solana-book-platform/
├── packages/
│   ├── book/                  # 链上程序
│   │   └── programs/book/src/
│   │       ├── instructions/  # book/ 和 escrow/ 指令
│   │       ├── state/         # BookAccount / EscrowAccount
│   │       └── error.rs
│   └── web/                   # 前端
│       ├── app/               # App Router 页面
│       ├── components/        # features/ layout/ shared/ ui/
│       └── lib/               # api/ hooks/ encryption/
└── book_server/               # 后端
    ├── src/
    │   ├── auth/              # SIWS 鉴权
    │   ├── chat/              # WebSocket 聊天
    │   ├── client/            # anchor-client 链上交互
    │   ├── db/                # SQLx 数据库层
    │   ├── handlers/          # HTTP 路由处理
    │   ├── reconcile/         # 链上数据同步
    │   └── infra/             # 汇率、限流、OSS 等基础设施
    └── migrations/            # PostgreSQL 迁移文件
```

---

## 本地运行

### 环境要求

- Rust 1.78+
- Node.js 20+
- PostgreSQL 15+
- Redis
- Solana CLI + Anchor CLI
- Yarn

### 后端

`.env   # 填写环境变量`

```bash
cd book_server

sqlx migrate run
cargo run
```

### 前端

```bash
cd packages/web
yarn install
yarn dev
```

### 链上程序

```bash
cd packages/book
anchor build
anchor deploy --provider.cluster devnet
```

---

## 链上部署

- **网络**：Solana Devnet
- **程序 ID**：`AQG2ZMQuQYSaSjxJwmsqQsASWChXwkTza2BRxKqBwHoC`

---

## 作者

kunkun 

## License

MIT
