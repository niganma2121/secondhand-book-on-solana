use super::*;

/// Book广播部分
impl AnchorService {
    pub async fn broadcast_create_book(
        &self,
        req: BroadcastCreateBookRequest,
        db: &DBService,
        id_generator: &Sonyflake,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        info!(
            "[create_book] broadcast start asset={} seller={}",
            req.asset, req.seller
        );
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let rpc = self.get_program()?.rpc();
        let send_result = rpc.send_and_confirm_transaction(&tx).await;
        let sig = match send_result {
            Ok(s) => s,
            Err(e) => {
                let err_s = e.to_string();
                if err_s.contains("already been processed") {
                    let recovered = tx_primary_signature(&tx).map_err(|ie| {
                        warn!(
                            "[create_book] duplicate tx but no signature asset={} seller={} err={}",
                            req.asset, req.seller, ie
                        );
                        ie
                    })?;
                    info!(
                        "[create_book] broadcast idempotent (链上已存在) asset={} sig={}",
                        req.asset, recovered
                    );
                    recovered
                } else {
                    warn!(
                        "[create_book] broadcast failed asset={} seller={} err={}",
                        req.asset, req.seller, err_s
                    );
                    return Err(ClientError::BroadcastFailed(err_s));
                }
            }
        };
        info!(
            "[create_book] broadcast confirmed asset={} sig={}",
            req.asset, sig
        );

        let collection = self.book_collection.to_string();
        if let Err(e) = db
            .insert_book(
                &req.asset,
                &req.book_pda,
                &req.seller,
                &collection,
                req.price as i64,
                &req.metadata_url,
                &req.metadata_hash,
                &req.name,
                Some(req.cover_url.as_str()),
                req.author.as_deref(),
                req.series.as_deref(),
                &req.category,
                &req.condition,
                now,
            )
            .await
        {
            warn!("创建书成功广播,数据库内部错误:{e}");
        }

        if !req.detail_urls.is_empty() {
            let mut images: Vec<(i64, &str, &str, i16, i64)> = Vec::new();
            for (i, url) in req.detail_urls.iter().enumerate() {
                let id = id_generator
                    .next_id()
                    .map_err(|e| ClientError::DbError(e.to_string()))? as i64;
                images.push((id, req.asset.as_str(), url.as_str(), i as i16, now));
            }
            if let Err(e) = db.insert_book_images(&images).await {
                warn!("图片入库失败: {e}");
            }
        }
        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "书籍已上链并入库".into(),
        })
    }

    pub async fn broadcast_delist_book(
        &self,
        req: BroadcastDelistRequest,
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

        if let Err(e) = db.update_book_status(&req.asset, "Delisted", now).await {
            warn!("书籍下架成功,数据库更新失败:{e}")
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "书籍下架成功".to_string(),
        })
    }

    pub async fn broadcast_update_price(
        &self,
        req: BroadcastUpdatePriceRequest,
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

        if let Err(e) = db.update_book_price(&req.asset, req.new_price as i64, now).await {
            warn!("书籍价格更新成功,数据库错误:{e}");
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "价格已经更新".into(),
        })
    }
}
