use crate::db::types::{EscrowEventRow, Page};
use crate::db::DBService;
use sqlx::Row;

impl DBService {
    pub async fn insert_escrow_event(
        &self,
        escrow_pda: &str,
        asset: &str,
        seller: &str,
        buyer: &str,
        from_state: Option<&str>,
        to_state: &str,
        action: &str,
        tx_signature: Option<&str>,
        actor_pubkey: Option<&str>,
        created_at: i64,
        payload: Option<serde_json::Value>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO escrow_events
               (escrow_pda, asset, seller, buyer, from_state, to_state, action, tx_signature, actor_pubkey, created_at, payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"#,
        )
        .bind(escrow_pda)
        .bind(asset)
        .bind(seller)
        .bind(buyer)
        .bind(from_state)
        .bind(to_state)
        .bind(action)
        .bind(tx_signature)
        .bind(actor_pubkey)
        .bind(created_at)
        .bind(payload)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    /// 幂等写入仲裁结案流水（同一 `tx_signature` 只写一条）。
    pub async fn try_insert_escrow_resolve_event(
        &self,
        escrow_pda: &str,
        asset: &str,
        seller: &str,
        buyer: &str,
        from_state: Option<&str>,
        tx_signature: &str,
        payload: &serde_json::Value,
        actor_pubkey: Option<&str>,
        created_at: i64,
    ) -> Result<bool, sqlx::Error> {
        let exists: bool = sqlx::query_scalar(
            r#"SELECT EXISTS(
                SELECT 1 FROM escrow_events
                WHERE escrow_pda = $1 AND tx_signature = $2 AND action = 'resolve_dispute'
            )"#,
        )
        .bind(escrow_pda)
        .bind(tx_signature)
        .fetch_one(&self.db_pool)
        .await?;
        if exists {
            return Ok(false);
        }
        self.insert_escrow_event(
            escrow_pda,
            asset,
            seller,
            buyer,
            from_state,
            "Released",
            "resolve_dispute",
            Some(tx_signature),
            actor_pubkey,
            created_at,
            Some(payload.clone()),
        )
        .await?;
        Ok(true)
    }

    /// 链上 `open_dispute` 已确认后：在同一事务内更新为 `Disputed` 并写入 `open_dispute` 流水（避免拆开写漏记）。
    pub async fn mark_escrow_disputed_with_event(
        &self,
        escrow_pda: &str,
        tx_signature: &str,
        actor_pubkey: Option<&str>,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        let rec = sqlx::query(
            r#"SELECT asset, seller, buyer, state
               FROM escrows
               WHERE escrow_pda = $1
               FOR UPDATE"#,
        )
        .bind(escrow_pda)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(rec) = rec else {
            return Err(sqlx::Error::RowNotFound);
        };
        let asset: String = rec.get("asset");
        let seller: String = rec.get("seller");
        let buyer: String = rec.get("buyer");
        let prev_state: String = rec.get("state");

        sqlx::query(
            r#"UPDATE escrows
               SET state = 'Disputed',
                   updated_at = $2,
                   disputed_at = COALESCE(disputed_at, $2)
               WHERE escrow_pda = $1"#,
        )
        .bind(escrow_pda)
        .bind(updated_at)
        .execute(&mut *tx)
        .await?;

        let dup_open: bool = sqlx::query_scalar(
            r#"SELECT EXISTS(
                SELECT 1 FROM escrow_events
                WHERE escrow_pda = $1 AND tx_signature = $2 AND action = 'open_dispute'
            )"#,
        )
        .bind(escrow_pda)
        .bind(tx_signature)
        .fetch_one(&mut *tx)
        .await?;

        if !dup_open {
            sqlx::query(
                r#"INSERT INTO escrow_events
                   (escrow_pda, asset, seller, buyer, from_state, to_state, action, tx_signature, actor_pubkey, created_at, payload)
                   VALUES ($1, $2, $3, $4, $5, 'Disputed', 'open_dispute', $6, $7, $8, NULL)"#,
            )
            .bind(escrow_pda)
            .bind(&asset)
            .bind(&seller)
            .bind(&buyer)
            .bind(&prev_state)
            .bind(tx_signature)
            .bind(actor_pubkey)
            .bind(updated_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn list_escrow_events(
        &self,
        escrow_pda: &str,
        page: &Page,
    ) -> Result<Vec<EscrowEventRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowEventRow>(
            r#"SELECT ee.id, ee.escrow_pda, ee.asset, ee.seller, ee.buyer, ee.from_state, ee.to_state, ee.action,
                      ee.tx_signature, ee.actor_pubkey, ee.created_at, ee.payload, e.book_snapshot
               FROM escrow_events ee
               LEFT JOIN escrows e ON e.escrow_pda = ee.escrow_pda
               WHERE ee.escrow_pda = $1
               ORDER BY ee.created_at DESC, ee.id DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(escrow_pda)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    pub async fn list_escrow_events_by_asset(
        &self,
        asset: &str,
        page: &Page,
    ) -> Result<Vec<EscrowEventRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowEventRow>(
            r#"SELECT ee.id, ee.escrow_pda, ee.asset, ee.seller, ee.buyer, ee.from_state, ee.to_state, ee.action,
                      ee.tx_signature, ee.actor_pubkey, ee.created_at, ee.payload, e.book_snapshot
               FROM escrow_events ee
               LEFT JOIN escrows e ON e.escrow_pda = ee.escrow_pda
               WHERE ee.asset = $1
               ORDER BY ee.created_at DESC, ee.id DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(asset)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    /// 仅返回「当前用户作为买家或卖家」参与的托管事件（用于书架「我买到的」等私密视图）。
    pub async fn list_escrow_events_by_asset_for_party(
        &self,
        asset: &str,
        party_pubkey: &str,
        page: &Page,
    ) -> Result<Vec<EscrowEventRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowEventRow>(
            r#"SELECT ee.id, ee.escrow_pda, ee.asset, ee.seller, ee.buyer, ee.from_state, ee.to_state, ee.action,
                      ee.tx_signature, ee.actor_pubkey, ee.created_at, ee.payload, e.book_snapshot
               FROM escrow_events ee
               LEFT JOIN escrows e ON e.escrow_pda = ee.escrow_pda
               WHERE ee.asset = $1 AND (ee.seller = $2 OR ee.buyer = $2)
               ORDER BY ee.created_at DESC, ee.id DESC
               LIMIT $3 OFFSET $4"#,
        )
        .bind(asset)
        .bind(party_pubkey)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    /// 在同一事务内完成取消订单、书籍回到 Listed、并写入事件。
    pub async fn cancel_escrow_with_event(
        &self,
        escrow_pda: &str,
        cancelled_by: &str,
        tx_signature: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        let rec = sqlx::query(
            r#"SELECT asset, seller, buyer, state
               FROM escrows
               WHERE escrow_pda = $1
               FOR UPDATE"#,
        )
        .bind(escrow_pda)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(rec) = rec else {
            return Err(sqlx::Error::RowNotFound);
        };
        let asset: String = rec.get("asset");
        let seller: String = rec.get("seller");
        let buyer: String = rec.get("buyer");
        let prev_state: String = rec.get("state");

        sqlx::query(
            r#"UPDATE escrows
               SET state = 'Cancelled', cancelled_by = $2, updated_at = $3
               WHERE escrow_pda = $1"#,
        )
        .bind(escrow_pda)
        .bind(cancelled_by)
        .bind(updated_at)
        .execute(&mut *tx)
        .await?;

        sqlx::query("UPDATE books SET status = 'Listed', updated_at = $2 WHERE asset = $1")
            .bind(&asset)
            .bind(updated_at)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"INSERT INTO book_events
               (asset, event_type, from_owner, to_owner, escrow_pda, tx_signature, actor_pubkey, payload, created_at)
               VALUES ($1, 'escrow_cancelled', $2, $3, $4, $5, $6, NULL, $7)"#,
        )
        .bind(&asset)
        .bind(&seller)
        .bind(&seller)
        .bind(escrow_pda)
        .bind(tx_signature)
        .bind(cancelled_by)
        .bind(updated_at)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT INTO escrow_events
               (escrow_pda, asset, seller, buyer, from_state, to_state, action, tx_signature, actor_pubkey, created_at)
               VALUES ($1, $2, $3, $4, $5, 'Cancelled', 'cancel', $6, $7, $8)"#,
        )
        .bind(escrow_pda)
        .bind(&asset)
        .bind(&seller)
        .bind(&buyer)
        .bind(&prev_state)
        .bind(tx_signature)
        .bind(cancelled_by)
        .bind(updated_at)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// 在同一事务内完成确认收货后的状态变更、成交计数、写历史事件。
    pub async fn confirm_receipt_with_event(
        &self,
        escrow_pda: &str,
        tx_signature: &str,
        actor_pubkey: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        let rec = sqlx::query(
            r#"SELECT asset, seller, buyer, state, trade_count_applied
               FROM escrows
               WHERE escrow_pda = $1
               FOR UPDATE"#,
        )
        .bind(escrow_pda)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(rec) = rec else {
            return Err(sqlx::Error::RowNotFound);
        };
        let asset: String = rec.get("asset");
        let seller: String = rec.get("seller");
        let buyer: String = rec.get("buyer");
        let prev_state: String = rec.get("state");
        let trade_count_applied: bool = rec.get("trade_count_applied");

        sqlx::query("UPDATE escrows SET state = 'Released', updated_at = $2 WHERE escrow_pda = $1")
            .bind(escrow_pda)
            .bind(updated_at)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE books SET status = 'Sold', updated_at = $2 WHERE asset = $1")
            .bind(&asset)
            .bind(updated_at)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"INSERT INTO book_events
               (asset, event_type, from_owner, to_owner, escrow_pda, tx_signature, actor_pubkey, payload, created_at)
               VALUES ($1, 'ownership_transferred', $2, $3, $4, $5, $6, NULL, $7)"#,
        )
        .bind(&asset)
        .bind(&seller)
        .bind(&buyer)
        .bind(escrow_pda)
        .bind(tx_signature)
        .bind(actor_pubkey)
        .bind(updated_at)
        .execute(&mut *tx)
        .await?;

        if !trade_count_applied {
            sqlx::query(
                "UPDATE users SET trade_count = trade_count + 1, sell_count = sell_count + 1 WHERE pubkey = $1",
            )
            .bind(&seller)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "UPDATE users SET trade_count = trade_count + 1, buy_count = buy_count + 1 WHERE pubkey = $1",
            )
            .bind(&buyer)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "UPDATE escrows SET trade_count_applied = true, updated_at = $2 WHERE escrow_pda = $1",
            )
            .bind(escrow_pda)
            .bind(updated_at)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query(
            r#"INSERT INTO escrow_events
               (escrow_pda, asset, seller, buyer, from_state, to_state, action, tx_signature, actor_pubkey, created_at)
               VALUES ($1, $2, $3, $4, $5, 'Released', 'confirm_receipt', $6, $7, $8)"#,
        )
        .bind(escrow_pda)
        .bind(&asset)
        .bind(&seller)
        .bind(&buyer)
        .bind(&prev_state)
        .bind(tx_signature)
        .bind(actor_pubkey)
        .bind(updated_at)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
}
