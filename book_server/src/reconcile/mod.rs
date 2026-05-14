//! **Reconcile（对账）**：周期性或由广播失败触发，用 RPC 读取链上 `Book` / `Escrow`（或根据 Book 推断已关闭的 Escrow），把数据库里的镜像字段对齐到链上真实状态。
//!
//! 与 [`dispute_listener`]（实时监听仲裁日志）同属「链 ↔ DB」同步层。
//!
//! ## 模块划分
//! - [`common`]：RPC 读链上 Book、枚举映射、统计结构
//! - [`escrow_mirror`]：托管行与链上 Escrow / 关闭推断
//! - [`book_mirror`]：书籍行与链上 Book（含缺行补偿）
//! - [`tick`]：一轮调度、`tokio::spawn`、定时循环
//! - [`dispute_listener`]：WebSocket 仲裁事件

mod book_mirror;
mod common;
mod dispute_listener;
mod dispute_outcome;
mod escrow_mirror;
mod tick;

pub use book_mirror::reconcile_one_book_mirror;
pub use common::chain_escrow_state_str;
pub use common::ReconcileStats;
pub use dispute_listener::listen_dispute_resolved;
pub use dispute_outcome::released_arbitration_outcome;
pub use escrow_mirror::reconcile_one_escrow_row;
pub use tick::{
    reconcile_loop, run_reconcile_tick, spawn_reconcile_book_asset, spawn_reconcile_tick,
};
