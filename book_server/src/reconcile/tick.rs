//! 对账调度：一轮扫描、后台 spawn、定时循环。
use super::book_mirror::{reconcile_one_book_mirror, reconcile_recent_books_mirror};
use super::common::ReconcileStats;
use super::escrow_mirror::{reconcile_one_escrow_row, reconcile_orphan_books};
use crate::client::types::AnchorService;
use crate::db::DBService;
use std::time::Duration;
use tracing::{info, warn};

pub async fn run_reconcile_tick(
    db: &DBService,
    anchor: &AnchorService,
) -> anyhow::Result<ReconcileStats> {
    let batch_escrows: i64 = std::env::var("BOOK_RECONCILE_ESCROW_BATCH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(120);
    let batch_books: i64 = std::env::var("BOOK_RECONCILE_BOOK_BATCH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(40);
    let batch_book_mirror: i64 = std::env::var("BOOK_RECONCILE_BOOK_MIRROR_BATCH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);

    let mut stats = ReconcileStats::default();

    let rows = db.list_escrows_for_reconcile(batch_escrows).await?;
    for row in rows {
        stats.scanned += 1;
        match reconcile_one_escrow_row(db, anchor, &row).await {
            Ok(true) => {
                stats.repaired += 1;
                info!(
                    "对账修正 escrow={} asset={}",
                    row.escrow_pda, row.asset
                );
            }
            Ok(false) => {}
            Err(e) => warn!(
                "对账单条失败 escrow={} asset={}: {:#}",
                row.escrow_pda, row.asset, e
            ),
        }
    }

    reconcile_orphan_books(db, anchor, batch_books, &mut stats).await?;

    reconcile_recent_books_mirror(db, anchor, batch_book_mirror, &mut stats).await?;

    Ok(stats)
}

pub fn spawn_reconcile_book_asset(db: DBService, anchor: AnchorService, asset: String) {
    tokio::spawn(async move {
        match reconcile_one_book_mirror(&db, &anchor, &asset).await {
            Ok(true) => info!(
                target: "book_server::reconcile",
                asset = %asset,
                "单本书籍链上镜像补偿完成"
            ),
            Ok(false) => {}
            Err(e) => warn!(
                target: "book_server::reconcile",
                asset = %asset,
                "单本书籍链上镜像补偿失败: {e:#}"
            ),
        }
    });
}

pub fn spawn_reconcile_tick(db: DBService, anchor: AnchorService) {
    tokio::spawn(async move {
        match run_reconcile_tick(&db, &anchor).await {
            Ok(s) => info!(
                target: "book_server::reconcile",
                scanned = s.scanned,
                repaired = s.repaired,
                "补偿对账 tick 完成"
            ),
            Err(e) => warn!(target: "book_server::reconcile", "补偿对账 tick 失败: {e:#}"),
        }
    });
}

pub async fn reconcile_loop(db: DBService, anchor: AnchorService) -> ! {
    let interval_secs: u64 = std::env::var("BOOK_RECONCILE_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(300);

    loop {
        match run_reconcile_tick(&db, &anchor).await {
            Ok(s) => info!(
                target: "book_server::reconcile",
                scanned = s.scanned,
                repaired = s.repaired,
                interval_secs,
                "定时对账 tick 完成"
            ),
            Err(e) => warn!(target: "book_server::reconcile", "定时对账 tick 失败: {e:#}"),
        }
        tokio::time::sleep(Duration::from_secs(interval_secs)).await;
    }
}
