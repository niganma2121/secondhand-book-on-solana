# 📚 Solana Book Platform

一个基于 Solana 区块链的去中心化二手书交易平台，支持 NFT 书籍铸造、实时聊天、托管交易及去中心化仲裁。

## 🏗️ 系统架构

1. **链上程序**：Anchor + Metaplex Core（NFT 铸造、Escrow 托管、仲裁）
2. **后端服务器**：Axum + SQLx + Anchor-Client（聊天、交易构建、缓存）
3. **前端界面**：React + TypeScript + Umi + Solana Wallet Adapter

## 🛠️ 技术栈

- **后端**：Rust 2021 + Axum + SQLx + Anchor-Client + DashMap + Tokio
- **区块链**：Solana + Anchor + Metaplex Core
- **数据库**：PostgreSQL + SQLx
- **实时通信**：WebSocket
- **前端**：React + TypeScript + Umi + TailwindCSS
- **认证**：SIWS（Sign In With Solana） + JWT

## 📅 路线图 (Roadmap)

### 前端功能(待完成)

- [x] 钱包连接与 SIWS 登录（Sign In With Solana）
- [ ] 书籍浏览列表与搜索功能
- [ ] 书籍详情页（展示 NFT 元数据、书况、价格）
- [ ] 上架书籍页面（填写信息并铸造 NFT）
- [ ] 实时聊天窗口（支持 Text、Image、BookOffer）
- [ ] 交易协商功能（报价、还价、PurchaseRequest）
- [ ] 交易确认与签名页面
- [ ] 个人中心（我的书籍、上架记录、聊天记录）
- [ ] 仲裁相关页面（提交纠纷、查看裁决结果）

### 后端功能

#### 基础设施

- [x] AppState 资源池管理（PgPool、Anchor Client、DashMap）
- [ ] 配置加载（.env + config.rs）
- [ ] 基础错误处理与统一响应格式

#### 实时通信(进行中)

- [x] WebSocket 握手与连接建立
- [x] 基于 Solana Pubkey 的 JWT 认证
- [x] 一对一聊天核心逻辑（Text、Image、BookOffer）
- [x] 系统推送（System 消息）
- [x] 消息已读回执与 Delivered 状态
- [ ] 聊天记录持久化存储（PostgreSQL）
- [ ] 离线消息支持
- [x] 心跳机制与连接管理

#### 交易与 NFT

- [ ] Metaplex Core NFT 铸造功能（后端构建交易）
- [ ] 后端构建交易 → 前端签名 → 后端验证 + 广播完整流程
- [ ] Escrow 托管逻辑（NFT + SOL 托管）
- [ ] 书籍信息缓存机制（DashMap / Redis）
- [ ] 链上事件监听器（Program Event Subscriber）
- [ ] 价格砍价与 Offer 管理（数据库 + 聊天联动）

#### 其他后端功能

- [ ] 用户信息存储与管理
- [ ] 书籍上架 / 下架 / 搜索接口

### 链上程序功能

- [x] 书籍 NFT 铸造指令（Metaplex Core）
- [x] Escrow 托管程序（NFT 锁定 + SOL 托管）
- [x] 转移指令（二手交易核心）
- [x] 去中心化仲裁机制（纠纷提交、证据上链、多签裁决）
- [x] 链上事件发射（供后端监听）

### 部署与优化

- [ ] Docker 部署配置
- [ ] CI/CD 流水线
- [ ] 性能优化（缓存、并发）
- [ ] 安全审计与测试覆盖
- [ ] 项目文档完善（API 文档 + 使用说明）

## ⚖️ License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
