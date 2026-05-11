use super::*;
use super::escrow_event_log::{
    load_escrow_snapshot, try_log_create_event, try_log_transition_event,
};
use crate::reconcile::spawn_reconcile_tick;
use std::time::Duration;
use tracing::{info, warn};

/// 托管广播部分
impl AnchorService {
    pub async fn broadcast_create_escrow_auto(
        &self,
        req: BroadcastCreateEscrowAutoRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;
        let escrow_pda_str = escrow_pda.to_string();
        let prev_state = load_escrow_snapshot(db, &escrow_pda_str)
            .await
            .map(|x| x.state);

        let mut db_miss = false;
        let insert_ok = db
            .insert_escrow(
                &escrow_pda_str,
                &req.asset,
                &req.seller,
                &req.buyer,
                req.price as i64,
                now,
            )
            .await
            .inspect_err(|e| warn!("托管创建成功,数据库错误:{e}"))
            .is_ok();
        if !insert_ok {
            db_miss = true;
        } else {
            // 仅在 escrows 行写入成功后再记事件，避免链上已成功但库未落单时出现孤立流水。
            try_log_create_event(
                db,
                &escrow_pda_str,
                &req.asset,
                &req.seller,
                &req.buyer,
                prev_state.as_deref(),
                &sig.to_string(),
                now,
            )
            .await;
        }

        if let Err(e) = db.update_book_status(&req.asset, "InEscrow", now).await {
            warn!("数据库书籍状态更新失败:{e}");
            db_miss = true;
        }
        if let Err(e) = db
            .insert_book_event(
                &req.asset,
                "escrow_created",
                Some(&req.seller),
                Some(&req.seller),
                Some(&escrow_pda_str),
                Some(&sig.to_string()),
                Some(&req.buyer),
                None,
                now,
            )
            .await
        {
            warn!("写入 book_events(escrow_created) 失败: {e}");
            db_miss = true;
        }
        if db_miss {
            spawn_reconcile_tick(db.clone(), self.clone());
            return Ok(BroadcastResponse::chain_confirmed(
                sig.to_string(),
                "购买成功，链上已确认；订单记录正在同步（通常几秒内完成），请勿重复提交同一笔交易",
                false,
                Some("db delayed".into()),
            ));
        }
        Ok(BroadcastResponse::chain_confirmed(
            sig.to_string(),
            "购买成功,书籍已锁定",
            true,
            None,
        ))
    }

    pub async fn broadcast_ship_book(
        &self,
        req: BroadcastShipRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;
        let snapshot = load_escrow_snapshot(db, &req.escrow_pda).await;

        if let Err(e) = db
            .update_escrow_shipped(&req.escrow_pda, &req.shipping_commitment, now)
            .await
        {
            warn!("数据库错误,更新内部的ship状态错误:{e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        } else if let Some(esc) = snapshot.as_ref() {
            try_log_transition_event(
                db,
                esc,
                "Shipped",
                "ship",
                &sig.to_string(),
                Some(&esc.seller),
                now,
            )
            .await;
        }
        Ok(BroadcastResponse::new(sig.to_string(), "发货消息已提交"))
    }

    pub async fn broadcast_confirm_receipt(
        &self,
        req: BroadcastConfirmReceiptRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;
        if let Err(e) = db
            .confirm_receipt_with_event(&req.escrow_pda, &sig.to_string(), &req.buyer, now)
            .await
        {
            warn!("数据库:确认收货事务失败:{e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }

        Ok(BroadcastResponse::new(sig.to_string(), "确认收获成功"))
    }

    pub async fn broadcast_cancel_escrow(
        &self,
        req: BroadcastCancelEscrowRequest,
        db: &DBService,
        cancelled_by: &str,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;

        let sig_str = sig.to_string();
        let mut synced = false;
        for attempt in 0u32..5u32 {
            let ts = if attempt == 0 {
                now
            } else {
                chrono::Utc::now().timestamp()
            };
            if db
                .cancel_escrow_with_event(&req.escrow_pda, cancelled_by, &sig_str, ts)
                .await
                .is_ok()
            {
                synced = true;
                break;
            }
            warn!(
                "取消订单 DB 同步失败(将重试) sig={} attempt={}",
                sig_str,
                attempt,
            );
            if attempt < 4 {
                tokio::time::sleep(Duration::from_millis(120 * (attempt + 1) as u64)).await;
            }
        }

        if !synced {
            warn!(
                "链上取消已成功但 DB 多次重试仍失败 sig={} escrow_pda={} asset={} — 已启动后台补偿",
                sig_str, req.escrow_pda, req.asset
            );
            spawn_reconcile_tick(db.clone(), self.clone());
            let db_bg = db.clone();
            let escrow_pda = req.escrow_pda.clone();
            let cancelled_by_owned = cancelled_by.to_string();
            let sig_bg = sig_str.clone();
            tokio::spawn(async move {
                for attempt in 0u32..24u32 {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    let ts = chrono::Utc::now().timestamp();
                    if db_bg
                        .cancel_escrow_with_event(&escrow_pda, &cancelled_by_owned, &sig_bg, ts)
                        .await
                        .is_ok()
                    {
                        info!(
                            "取消订单 DB 后台补偿成功 sig={} escrow_pda={} attempt={}",
                            sig_bg, escrow_pda, attempt
                        );
                        return;
                    }
                    warn!(
                        "取消订单 DB 后台补偿未成功 escrow_pda={} attempt={}",
                        escrow_pda, attempt
                    );
                }
                warn!(
                    "取消订单 DB 后台补偿放弃 escrow_pda={} sig={}",
                    escrow_pda, sig_bg
                );
            });
            return Ok(BroadcastResponse::chain_confirmed(
                sig_str,
                "链上取消已成功。数据库同步稍有延迟，订单与市场列表可能稍后更新；请勿重复提交同一笔链上交易。",
                false,
                None,
            ));
        }

        Ok(BroadcastResponse::chain_confirmed(
            sig_str,
            "取消交易成功",
            true,
            None,
        ))
    }

    pub async fn broadcast_open_dispute(
        &self,
        req: BroadcastOpenDisputeRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;
        let snapshot = load_escrow_snapshot(db, &req.escrow_pda).await;
        if let Err(e) = db.update_escrow_state(&req.escrow_pda, "Disputed", now).await {
            warn!("数据库:更新托管状态错误:{e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        } else if let Some(esc) = snapshot.as_ref() {
            try_log_transition_event(
                db,
                esc,
                "Disputed",
                "open_dispute",
                &sig.to_string(),
                Some(&esc.buyer),
                now,
            )
            .await;
        }

        Ok(BroadcastResponse::new(
            sig.to_string(),
            "仲裁发起成功,等待仲裁员投票",
        ))
    }

    pub async fn broadcast_resolve_dispute(
        &self,
        req: BroadcastResolveDisputeRequest,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;

        info!(
            "仲裁投票已广播 escrow={} sig={},time:{}",
            req.escrow_pda, sig, now
        );
        Ok(BroadcastResponse::new(sig.to_string(), "投票成功"))
    }
}