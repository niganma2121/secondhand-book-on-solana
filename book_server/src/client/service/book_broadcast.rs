use super::*;
use crate::client::utils::{has_at_most_two_decimals, lamports_to_price_cny};
use crate::reconcile::{spawn_reconcile_book_asset, spawn_reconcile_tick};

/// Book广播部分
impl AnchorService {
    fn validate_fiat_fields(req: &BroadcastCreateBookRequest) -> Result<(), ClientError> {
        // 只要传了人民币价格，就必须满足：>0、两位小数内、合理区间，并且带汇率快照
        if let Some(price_cny) = req.price_cny {
            if !price_cny.is_finite() || price_cny <= 0.0 {
                return Err(ClientError::TxVerifyFailed("price_cny 必须大于 0".into()));
            }
            if !has_at_most_two_decimals(price_cny) {
                return Err(ClientError::TxVerifyFailed("price_cny 最多保留两位小数".into()));
            }
            if price_cny > 1_000_000.0 {
                return Err(ClientError::TxVerifyFailed("price_cny 超出允许范围".into()));
            }
            let fx = req.fx_cny_per_sol.ok_or_else(|| {
                ClientError::TxVerifyFailed("传入 price_cny 时必须同时传入 fx_cny_per_sol".into())
            })?;
            if !fx.is_finite() || fx <= 0.0 {
                return Err(ClientError::TxVerifyFailed("fx_cny_per_sol 必须大于 0".into()));
            }
            // 与入库时 `lamports_to_price_cny` 一致：不能用 (price_cny/fx)*1e9 反推 lamports，
            // 人民币仅两位小数会丢失精度，反推误差可达数千 lamports。
            let from_lamports = lamports_to_price_cny(req.price, fx);
            if (from_lamports - price_cny).abs() > 0.01 {
                return Err(ClientError::TxVerifyFailed(
                    "price 与 price_cny/fx_cny_per_sol 换算不一致".into(),
                ));
            }
        } else if req.fx_cny_per_sol.is_some() {
            // 没传人民币价格就不需要单独传汇率，避免脏数据
            return Err(ClientError::TxVerifyFailed(
                "未传 price_cny 时不应单独传 fx_cny_per_sol".into(),
            ));
        }
        Ok(())
    }

    pub async fn broadcast_create_book(
        &self,
        req: BroadcastCreateBookRequest,
        db: &DBService,
        id_generator: &Sonyflake,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        Self::validate_fiat_fields(&req)?;
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
        let mut db_miss = false;
        if let Err(e) = db
            .insert_book(
                &req.asset,
                &req.book_pda,
                &req.seller,
                &collection,
                req.price as i64,
                req.price_cny,
                req.fx_cny_per_sol,
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
            db_miss = true;
            spawn_reconcile_book_asset(db.clone(), self.clone(), req.asset.clone());
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
                db_miss = true;
            }
        }
        if let Err(e) = db
            .insert_book_event(
                &req.asset,
                "book_created",
                None,
                Some(&req.seller),
                None,
                Some(&sig.to_string()),
                Some(&req.seller),
                None,
                now,
            )
            .await
        {
            warn!("写入 book_events(book_created) 失败: {e}");
            db_miss = true;
        }
        if db_miss {
            spawn_reconcile_tick(db.clone(), self.clone());
        }
        Ok(BroadcastResponse::new(sig.to_string(), "书籍已上链并入库"))
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

        if let Err(e) = db.update_book_status(&req.asset, "DeListed", now).await {
            warn!("书籍下架成功,数据库更新失败:{e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }
        if let Err(e) = db
            .insert_book_event(
                &req.asset,
                "book_delisted",
                Some(&req.seller),
                Some(&req.seller),
                None,
                Some(&sig.to_string()),
                Some(&req.seller),
                None,
                now,
            )
            .await
        {
            warn!("写入 book_events(book_delisted) 失败: {e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }

        Ok(BroadcastResponse::new(sig.to_string(), "书籍下架成功"))
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

        if let Err(e) = db
            .update_book_price(
                &req.asset,
                req.new_price as i64,
                req.price_cny,
                req.fx_cny_per_sol,
                now,
            )
            .await
        {
            warn!("书籍价格更新成功,数据库错误:{e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }
        let seller_for_event = match db.get_book_detail(&req.asset).await {
            Ok(Some(book)) => Some(book.seller),
            Ok(None) => None,
            Err(e) => {
                warn!("查询书籍卖家用于写入 book_events(price_updated) 失败: {e}");
                None
            }
        };
        if let Err(e) = db
            .insert_book_event(
                &req.asset,
                "price_updated",
                seller_for_event.as_deref(),
                seller_for_event.as_deref(),
                None,
                Some(&sig.to_string()),
                seller_for_event.as_deref(),
                None,
                now,
            )
            .await
        {
            warn!("写入 book_events(price_updated) 失败: {e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }

        Ok(BroadcastResponse::new(sig.to_string(), "价格已经更新"))
    }

    pub async fn broadcast_relist_book(
        &self,
        req: BroadcastRelistBookRequest,
        db: &DBService,
        id_generator: &Sonyflake,
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
            .update_book_for_relist(
                &req.asset,
                &req.seller,
                req.price as i64,
                req.price_cny,
                req.fx_cny_per_sol,
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
            warn!("转卖成功后更新 books 失败:{e}");
            spawn_reconcile_book_asset(db.clone(), self.clone(), req.asset.clone());
            spawn_reconcile_tick(db.clone(), self.clone());
        }

        let mut images: Vec<(i64, &str, &str, i16, i64)> = Vec::new();
        for (i, url) in req.detail_urls.iter().enumerate() {
            let id = id_generator
                .next_id()
                .map_err(|e| ClientError::DbError(e.to_string()))? as i64;
            images.push((id, req.asset.as_str(), url.as_str(), i as i16, now));
        }
        if let Err(e) = db.replace_book_images(&req.asset, &images).await {
            warn!("转卖成功后替换详情图失败:{e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }

        if let Err(e) = db
            .insert_book_event(
                &req.asset,
                "book_relisted",
                Some(&req.seller),
                Some(&req.seller),
                None,
                Some(&sig.to_string()),
                Some(&req.seller),
                None,
                now,
            )
            .await
        {
            warn!("写入 book_events(book_relisted) 失败: {e}");
            spawn_reconcile_tick(db.clone(), self.clone());
        }

        Ok(BroadcastResponse::new(sig.to_string(), "转卖上架成功"))
    }
}
