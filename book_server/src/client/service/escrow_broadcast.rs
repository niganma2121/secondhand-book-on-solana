use super::*;

/// 托管广播部分
impl AnchorService {
    pub async fn broadcast_create_escrow_auto(
        &self,
        req: BroadcastCreateEscrowAutoRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&seller, &asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;

        if let Err(e) = db
            .insert_escrow(
                &escrow_pda.to_string(),
                &req.asset,
                &req.seller,
                &req.buyer,
                req.price as i64,
                now,
            )
            .await
        {
            warn!("托管创建成功,数据库错误:{e}");
        }

        if let Err(e) = db.update_book_status(&req.asset, "LOCKED", now).await {
            warn!("数据库书籍状态更新失败:{e}")
        }
        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "购买成功,书籍已锁定".into(),
        })
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

        if let Err(e) = db
            .update_escrow_shipped(&req.escrow_pda, &req.shipping_commitment, now)
            .await
        {
            warn!("数据库错误,更新内部的ship状态错误:{e}")
        }
        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "发货消息已提交".into(),
        })
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

        if let Err(e) = db.update_escrow_state(&req.asset, "Completed", now).await {
            warn!("数据库:更新托管状态出错:{e}");
        }
        if let Err(e) = db.update_book_status(&req.asset, "Sold", now).await {
            warn!("数据库:更新书籍状态出错:{e}");
        }
        if let Err(e) = db.increment_trade_counts(&req.seller, &req.buyer).await {
            warn!("数据库:增加交易信息出错:{e}");
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "确认收获成功".into(),
        })
    }

    pub async fn broadcast_cancel_escrow(
        &self,
        req: BroadcastCancelEscrowRequest,
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

        if let Err(e) = db.update_escrow_state(&req.escrow_pda, "Canceled", now).await {
            warn!("数据库:更新托管状态失败:{e}")
        }

        if let Err(e) = db.update_book_status(&req.escrow_pda, "Listed", now).await {
            warn!("数据库:更新书籍状态失败:{e}")
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "取消交易成功".into(),
        })
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
        if let Err(e) = db.update_escrow_state(&req.escrow_pda, "Disputed", now).await {
            warn!("数据库:更新托管状态错误:{e}")
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "仲裁发起成功,等待仲裁员投票".into(),
        })
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
        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "投票成功".into(),
        })
    }
}