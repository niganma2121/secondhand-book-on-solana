//! 书籍 `Book` 账户与 `books` 表对齐。
use super::common::{
    chain_book_status_str, fetch_book_chain, metadata_hash_matches_db, ReconcileStats,
};
use crate::client::types::AnchorService;
use crate::db::DBService;
use anchor_lang::prelude::Pubkey;
use anyhow::Context;
use std::str::FromStr;
use tracing::{info, warn};

pub async fn reconcile_one_book_mirror(
    db: &DBService,
    anchor: &AnchorService,
    asset_str: &str,
) -> anyhow::Result<bool> {
    let asset_pk =
        Pubkey::from_str(asset_str).with_context(|| format!("asset {}", asset_str))?;
    let chain = fetch_book_chain(anchor, &asset_pk).await?;
    let now = chrono::Utc::now().timestamp();

    let seller_str = chain.seller.to_string();
    db.insert_user(&seller_str, now).await?;

    let chain_status = chain_book_status_str(&chain.status);
    let chain_price = chain.price as i64;
    let cid_trim = chain.metadata_cid.trim();
    let meta_url = if cid_trim.is_empty() {
        String::new()
    } else {
        anchor.ipfs_gateway_url(cid_trim)
    };

    if let Some(detail) = db.get_book_detail(asset_str).await? {
        let mut repaired = false;
        if detail.status != chain_status {
            db.update_book_status(asset_str, chain_status, now).await?;
            repaired = true;
        }
        if detail.price != chain_price {
            db.update_book_price(asset_str, chain_price, now).await?;
            repaired = true;
        }
        if !cid_trim.is_empty()
            && (!metadata_hash_matches_db(&detail.metadata_hash, &chain.metadata_hash)
                || detail.metadata_url != meta_url)
        {
            db.update_book_metadata_mirror(asset_str, &meta_url, &chain.metadata_hash, now)
                .await?;
            repaired = true;
        }
        return Ok(repaired);
    }

    let category = db.pick_default_book_category_key().await?;
    let book_pda = anchor.book_pda(&asset_pk).to_string();
    let collection = anchor.book_collection.to_string();
    db.insert_book(
        asset_str,
        &book_pda,
        &seller_str,
        &collection,
        chain_price,
        None,
        None,
        if meta_url.is_empty() { "about:blank" } else { meta_url.as_str() },
        chain.metadata_hash.as_slice(),
        "（链上同步，待补全）",
        None,
        None,
        None,
        &category,
        "Good",
        now,
    )
    .await?;
    Ok(true)
}

pub async fn reconcile_recent_books_mirror(
    db: &DBService,
    anchor: &AnchorService,
    limit: i64,
    stats: &mut ReconcileStats,
) -> anyhow::Result<()> {
    let assets = db.list_recent_book_assets(limit).await?;
    for asset in assets {
        stats.scanned += 1;
        match reconcile_one_book_mirror(db, anchor, &asset).await {
            Ok(true) => {
                stats.repaired += 1;
                info!(target: "book_server::reconcile", "书籍镜像修正 asset={}", asset);
            }
            Ok(false) => {}
            Err(e) => warn!(
                target: "book_server::reconcile",
                "书籍镜像对账失败 asset={}: {:#}",
                asset, e
            ),
        }
    }
    Ok(())
}
