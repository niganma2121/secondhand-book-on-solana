//! WebSocket 订阅程序日志：解析 `DisputeResolvedEvent` 并写入数据库（与定时链上对账同属「链 ↔ DB」同步层）。
use crate::client::book::events::DisputeResolvedEvent;
use crate::client::{ArbitrationResult, BOOK_PROGRAM_ID};
use crate::db::DBService;
use anchor_client::solana_client::nonblocking::pubsub_client::PubsubClient;
use anchor_client::solana_client::rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter};
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_lang::AnchorDeserialize;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use futures::StreamExt;
use serde_json::json;
use tracing::{info, warn};

pub async fn listen_dispute_resolved(db: DBService, ws_url: String) -> ! {
    loop {
        info!("启动仲裁事件监听....");
        match run_listener(&db, &ws_url).await {
            Ok(_) => info!("正常退出"),
            Err(e) => warn!("监听异常退出:{}", e),
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}

async fn run_listener(db: &DBService, ws_url: &str) -> anyhow::Result<()> {
    let client = PubsubClient::new(ws_url).await?;

    let (mut stream, _) = client
        .logs_subscribe(
            RpcTransactionLogsFilter::Mentions(vec![BOOK_PROGRAM_ID.to_string()]),
            RpcTransactionLogsConfig {
                commitment: Some(CommitmentConfig::confirmed()),
            },
        )
        .await?;

    while let Some(log) = stream.next().await {
        let slot = log.context.slot as i64;
        let signature = log.value.signature.clone();
        // 仅解析「含 ResolveDispute 指令」的交易里的 Program data，避免每条 Book 程序交易都全量扫日志
        let should_parse_logs = log.value.logs.iter().any(|l| l.contains("ResolveDispute"))
            && log
                .value
                .logs
                .iter()
                .any(|l| l.trim_start().starts_with("Program data:"));
        if !should_parse_logs {
            continue;
        }
        if let Err(e) = handle_dispute_resolved(&log.value.logs, &signature, slot, db).await {
            warn!("处理仲裁事件失败: {e}");
        }
    }
    Ok(())
}

async fn handle_dispute_resolved(
    logs: &[String],
    signature: &str,
    slot: i64,
    db: &DBService,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().timestamp();

    for (idx, line) in logs.iter().enumerate() {
        if !line.trim_start().starts_with("Program data:") {
            continue;
        }
        let b64 = line.trim_start_matches("Program data:").trim();
        let bytes = match STANDARD.decode(b64) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if bytes.len() < 8 {
            continue;
        }
        let event = match DisputeResolvedEvent::deserialize(&mut &bytes[8..]) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let inserted = db
            .try_insert_chain_event_dedup(
                signature,
                slot,
                idx as i32,
                "DisputeResolvedEvent",
                now,
            )
            .await?;
        if !inserted {
            continue;
        }

        let escrow_pda = event.escrow.to_string();

        let escrow = db.get_escrow(&escrow_pda).await?;
        let Some(escrow) = escrow else {
            warn!("数据库中缺少托管:{escrow_pda}");
            continue;
        };
        let book_status = match (event.result, event.return_book) {
            (ArbitrationResult::BuyerWin, true) => "Listed",
            (ArbitrationResult::BuyerWin, false) => "Sold",
            (ArbitrationResult::SellerWin, _) => "Sold",
            _ => "Sold",
        };
        if let Err(e) = db.update_escrow_state(&escrow_pda, "Released", now).await {
            warn!("数据库:更新 escrow 状态失败: {e}");
        }
        if let Err(e) = db.update_book_status(&escrow.asset, book_status, now).await {
            warn!("更新 book 状态失败: {e}");
        }
        if let Err(e) =
            db.release_escrow_trade_counts_once(&escrow_pda, &escrow.seller, &escrow.buyer, now)
                .await
        {
            warn!("仲裁结案成交计数失败 escrow={}: {e}", escrow_pda);
        }
        if let Err(e) = db
            .apply_dispute_resolution_reputation(&escrow.seller, &escrow.buyer, event.result)
            .await
        {
            warn!("仲裁结案信誉统计失败 escrow={}: {e}", escrow_pda);
        }

        let winner = match event.result {
            ArbitrationResult::BuyerWin => "buyer",
            ArbitrationResult::SellerWin => "seller",
            ArbitrationResult::Voting => {
                warn!("仲裁链上事件 result=Voting（非终局），跳过结案流水 escrow={}", escrow_pda);
                continue;
            }
        };
        let payload = json!({
            "winner": winner,
            "return_book": event.return_book,
            "refund_lamports": event.refund_amount,
        });
        match db
            .try_insert_escrow_resolve_event(
                &escrow.escrow_pda,
                &escrow.asset,
                &escrow.seller,
                &escrow.buyer,
                Some("Disputed"),
                signature,
                &payload,
                None,
                now,
            )
            .await
        {
            Ok(true) => info!("WS 已写入仲裁结案流水 escrow={}", escrow_pda),
            Ok(false) => {}
            Err(e) => warn!("WS 仲裁结案流水写入失败 escrow={} err={}", escrow_pda, e),
        }

        info!(
            "仲裁裁决已同步 escrow={} result={:?} book_status={} signature={}",
            escrow_pda, event.result, book_status, signature
        );
    }
    db.set_chain_cursor("book_program_logs", slot, now).await?;
    Ok(())
}
