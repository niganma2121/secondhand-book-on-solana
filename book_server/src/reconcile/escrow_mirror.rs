//! 托管 `Escrow` 与数据库镜像对齐（含账户已关闭时的推断）。
use super::common::{
    chain_book_status_str, chain_escrow_state_str, fetch_book_chain, ReconcileStats,
};
use crate::client::types::AnchorService;
use crate::client::{Book, BookStatus, Escrow};
use crate::db::types::EscrowRow;
use crate::db::DBService;
use anchor_lang::AccountDeserialize;
use anchor_lang::prelude::Pubkey;
use anyhow::Context;
use std::str::FromStr;
use tracing::{info, warn};

pub async fn reconcile_one_escrow_row(
    db: &DBService,
    anchor: &AnchorService,
    row: &EscrowRow,
) -> anyhow::Result<bool> {
    let now = chrono::Utc::now().timestamp();
    let escrow_pk =
        Pubkey::from_str(&row.escrow_pda).with_context(|| format!("escrow_pda {}", row.escrow_pda))?;
    let asset_pk = Pubkey::from_str(&row.asset).with_context(|| format!("asset {}", row.asset))?;

    let program = anchor
        .get_program()
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    let rpc = program.rpc();

    let chain_book = match fetch_book_chain(anchor, &asset_pk).await {
        Ok(b) => b,
        Err(e) => {
            warn!("对账跳过 asset={} escrow={}: {:#}", row.asset, row.escrow_pda, e);
            return Ok(false);
        }
    };
    let target_book_status = chain_book_status_str(&chain_book.status).to_string();

    match rpc.get_account(&escrow_pk).await {
        Ok(account) => {
            let mut data: &[u8] = &account.data;
            let on_chain = Escrow::try_deserialize(&mut data)
                .with_context(|| format!("Escrow 反序列化失败 escrow={}", row.escrow_pda))?;
            let target_esc_state = chain_escrow_state_str(&on_chain.state).to_string();

            let mut repaired = false;

            if row.pre_ship_locked != on_chain.pre_ship_locked {
                db.set_escrow_pre_ship_locked(&row.escrow_pda, on_chain.pre_ship_locked, now)
                    .await?;
                repaired = true;
            }

            if row.state != target_esc_state {
                apply_escrow_state_from_chain(db, row, &target_esc_state, &on_chain, now).await?;
                repaired = true;
            } else if target_esc_state == "Shipped" {
                if let Some(ref ship) = on_chain.ship {
                    let want: &[u8] = ship.shipping_commitment.as_slice();
                    let same = row
                        .shipping_commitment
                        .as_ref()
                        .map(|c| c.as_slice() == want)
                        .unwrap_or(false);
                    if !same {
                        db.update_escrow_shipped(&row.escrow_pda, want, now).await?;
                        repaired = true;
                    }
                }
            }

            if row_needs_book_sync(db, &row.asset, &target_book_status).await? {
                db.update_book_status(&row.asset, &target_book_status, now).await?;
                repaired = true;
            }

            if target_esc_state == "Released" {
                db.release_escrow_trade_counts_once(&row.escrow_pda, &row.seller, &row.buyer, now)
                    .await?;
                if !row.trade_count_applied {
                    repaired = true;
                }
            }

            Ok(repaired)
        }
        Err(_) => fix_closed_escrow_mirror(db, row, &chain_book, &target_book_status, now).await,
    }
}

async fn row_needs_book_sync(
    db: &DBService,
    asset: &str,
    target_book_status: &str,
) -> anyhow::Result<bool> {
    let Some(detail) = db.get_book_detail(asset).await? else {
        return Ok(false);
    };
    Ok(detail.status != target_book_status)
}

async fn fix_closed_escrow_mirror(
    db: &DBService,
    row: &EscrowRow,
    chain_book: &Book,
    target_book_status: &str,
    now: i64,
) -> anyhow::Result<bool> {
    let mut repaired = false;

    match row.state.as_str() {
        "Paid" | "Shipped" => match chain_book.status {
            BookStatus::Listed => {
                if row.state != "Cancelled" {
                    db.update_escrow_state(&row.escrow_pda, "Cancelled", now).await?;
                    repaired = true;
                }
            }
            BookStatus::Sold => {
                if row.state != "Released" {
                    db.update_escrow_state(&row.escrow_pda, "Released", now).await?;
                    repaired = true;
                }
                db.release_escrow_trade_counts_once(&row.escrow_pda, &row.seller, &row.buyer, now)
                    .await?;
            }
            BookStatus::InEscrow | BookStatus::DeListed => {}
        },
        _ => {}
    }

    if row_needs_book_sync(db, &row.asset, target_book_status).await? {
        db.update_book_status(&row.asset, target_book_status, now).await?;
        repaired = true;
    }

    Ok(repaired)
}

async fn apply_escrow_state_from_chain(
    db: &DBService,
    row: &EscrowRow,
    target_state: &str,
    on_chain: &Escrow,
    now: i64,
) -> anyhow::Result<()> {
    match target_state {
        "Shipped" => {
            if let Some(ref ship) = on_chain.ship {
                db.update_escrow_shipped(&row.escrow_pda, &ship.shipping_commitment[..], now)
                    .await?;
            } else {
                db.update_escrow_state(&row.escrow_pda, target_state, now).await?;
            }
        }
        _ => {
            db.update_escrow_state(&row.escrow_pda, target_state, now).await?;
        }
    }
    Ok(())
}

pub async fn reconcile_orphan_books(
    db: &DBService,
    anchor: &AnchorService,
    limit: i64,
    stats: &mut ReconcileStats,
) -> anyhow::Result<()> {
    let assets = db.list_assets_by_book_status("InEscrow", limit).await?;
    for asset in assets {
        stats.scanned += 1;
        let Ok(asset_pk) = Pubkey::from_str(&asset) else {
            continue;
        };
        let chain_book = match fetch_book_chain(anchor, &asset_pk).await {
            Ok(b) => b,
            Err(_) => continue,
        };
        let target = chain_book_status_str(&chain_book.status);
        if target == "InEscrow" {
            continue;
        }
        let now = chrono::Utc::now().timestamp();
        if db.update_book_status(&asset, target, now).await.is_ok() {
            stats.repaired += 1;
            info!(
                "对账修正书籍状态 asset={} -> {}",
                asset, target
            );
        }
    }
    Ok(())
}
