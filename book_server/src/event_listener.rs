use crate::db::DBService;
use anchor_client::solana_client::nonblocking::pubsub_client::PubsubClient;
use anchor_client::solana_client::rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter};
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_lang::AnchorDeserialize;
use base64::engine::general_purpose::STANDARD;
use futures::StreamExt;
use tracing::{info, warn};
use crate::client::{ArbitrationResult, BOOK_PROGRAM_ID};
use base64::Engine;
use crate::client::book::events::DisputeResolvedEvent;
use std::time::Duration;


pub async fn listen_dispute_resolved(
    db: DBService,
    ws_url: String,
) -> ! {
    loop {
        info!("启动仲裁事件监听....");
        match run_listener(&db, &ws_url).await {
            Ok(_) => info!("正常退出"),
            Err(e) => warn!("监听异常退出:{}",e)
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
                commitment: Some(CommitmentConfig::confirmed())
            },
        ).await?;

    while let Some(log) = stream.next().await {
        let slot = log.context.slot as i64;
        let signature = log.value.signature.clone();
        let has_event = log.value.logs
            .iter()
            .any(|l| l.contains("DisputeResolvedEvent"));
        if !has_event {
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
        if !line.starts_with("Program data:") {
            continue;
        }
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
        let b64 = line.trim_start_matches("Program data:").trim();
        let bytes = STANDARD.decode(b64)?;

        //跳过8字节的标识
        if bytes.len() < 8 {
            continue;
        }
        let event = DisputeResolvedEvent::deserialize(&mut &bytes[8..]);

        let event = match event {
            Ok(e) => e,
            Err(_) => continue
        };
        let escrow_pda = event.escrow.to_string();

        let escrow = db.get_escrow(&escrow_pda).await?;
        let Some(escrow) = escrow else {
            warn!("数据库中缺少托管:{escrow_pda}");
            continue;
        };
        let book_status = match (event.result, event.return_book) {
            (ArbitrationResult::BuyerWin, true) => "Listed",// 书退回卖家重新上架
            (ArbitrationResult::BuyerWin, false) => "Sold",// 书判给买家
            (ArbitrationResult::SellerWin, _) => "Sold",// 卖家赢，书给买家
            _=>"Sold"
        };
        if let Err(e)=db.update_escrow_state(&escrow_pda,"Released",now).await{
            warn!("数据库:更新 escrow 状态失败: {e}");
        }
        if let Err(e) = db.update_book_status(&escrow.asset, book_status, now).await {
            warn!("更新 book 状态失败: {e}");
        }

        info!(
            "仲裁裁决已同步 escrow={} result={:?} book_status={} signature={}",
            escrow_pda, event.result, book_status, signature
        );
    }
    db.set_chain_cursor("book_program_logs", slot, now).await?;
    Ok(())
}

/// 低频补偿：按游标窗口执行一次对账（骨架）
pub async fn run_reconcile_once(db: &DBService, window_slots: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().timestamp();
    let last_slot = db.get_chain_cursor("book_program_logs").await?.unwrap_or(0);
    let from_slot = (last_slot - window_slots).max(0);
    let to_slot = last_slot;
    let run_id = db.start_reconcile_run(now, from_slot, to_slot).await?;

    // TODO: 在这里调用 RPC 按 slot window 拉取程序交易并与 DB 对比。
    // 当前先记录运行痕迹，后续可在此处填充 scanned/repaired/mismatch 统计。
    let scanned_count = 0;
    let repaired_count = 0;
    let mismatch_count = 0;

    db.finish_reconcile_run(
        run_id,
        chrono::Utc::now().timestamp(),
        scanned_count,
        repaired_count,
        mismatch_count,
        None,
    )
    .await?;

    info!(
        "对账任务完成 run_id={} from_slot={} to_slot={} scanned={} repaired={} mismatch={}",
        run_id, from_slot, to_slot, scanned_count, repaired_count, mismatch_count
    );
    Ok(())
}

/// 后台循环：周期性低频对账
pub async fn reconcile_loop(db: DBService) -> ! {
    loop {
        if let Err(e) = run_reconcile_once(&db, 20_000).await {
            warn!("对账任务失败: {e}");
        }
        tokio::time::sleep(Duration::from_secs(60 * 60)).await;
    }
}

