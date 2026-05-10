use crate::db::DBService;
use crate::db::types::{EscrowActivityRow, EscrowRow, Page};

impl DBService {
    /// 买家买书：写入新托管行。
    /// `escrow_pda` 由 [buyer, book] 确定性派生，取消订单后再买会得到相同 PDA；
    /// 若该行已为 `Cancelled`，则复活为 `Paid` 并刷新价格时间；否则依赖唯一约束拒绝非法重复。
    pub async fn insert_escrow(
        &self,
        escrow_pda: &str,
        asset: &str,
        seller: &str,
        buyer: &str,
        price: i64,
        created_at: i64,
    ) -> Result<(), sqlx::Error> {
        let result = sqlx::query(
            r#"INSERT INTO escrows
                (escrow_pda, asset, seller, buyer, price, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $6)
               ON CONFLICT (escrow_pda) DO UPDATE SET
                   asset               = EXCLUDED.asset,
                   seller              = EXCLUDED.seller,
                   buyer               = EXCLUDED.buyer,
                   price               = EXCLUDED.price,
                   state               = 'Paid',
                   cancelled_by        = NULL,
                   shipping_commitment = NULL,
                   trade_count_applied = false,
                   updated_at          = EXCLUDED.updated_at
               WHERE escrows.state = 'Cancelled'"#,
        )
        .bind(escrow_pda)
        .bind(asset)
        .bind(seller)
        .bind(buyer)
        .bind(price)
        .bind(created_at)
        .execute(&self.db_pool)
        .await?;
        if result.rows_affected() == 0 {
            // ON CONFLICT 命中但不满足 WHERE（例如旧状态不是 Cancelled）时会返回 0 行变更。
            // 这里显式报错，交给上层走 db_miss + reconcile，避免“链上成功但库里无活跃托管”的静默失败。
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // 更新托管状态
    pub async fn update_escrow_state(
        &self,
        escrow_pda: &str,
        state: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE escrows
             SET state = $2, updated_at = $3
             WHERE escrow_pda = $1",
            escrow_pda,
            state,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    pub async fn update_escrow_cancelled(
        &self,
        escrow_pda: &str,
        cancelled_by: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE escrows
             SET state = 'Cancelled', cancelled_by = $2, updated_at = $3
             WHERE escrow_pda = $1",
            escrow_pda,
            cancelled_by,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // 卖家发货，写入 shipping_commitment
    pub async fn update_escrow_shipped(
        &self,
        escrow_pda: &str,
        shipping_commitment: &[u8],
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE escrows
             SET state               = 'Shipped',
                 shipping_commitment = $2,
                 updated_at          = $3
             WHERE escrow_pda = $1",
            escrow_pda,
            shipping_commitment,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    /// Released 且未计过时：在同一事务内递增买卖双方成交次数并标记幂等。
    pub async fn release_escrow_trade_counts_once(
        &self,
        escrow_pda: &str,
        seller: &str,
        buyer: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        let gate = sqlx::query!(
            "SELECT escrow_pda FROM escrows
             WHERE escrow_pda = $1 AND state = 'Released' AND trade_count_applied = false
             FOR UPDATE",
            escrow_pda
        )
        .fetch_optional(&mut *tx)
        .await?;
        if gate.is_none() {
            tx.commit().await?;
            return Ok(());
        }
        sqlx::query!(
            "UPDATE users SET trade_count = trade_count + 1, sell_count = sell_count + 1 WHERE pubkey = $1",
            seller
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "UPDATE users SET trade_count = trade_count + 1, buy_count = buy_count + 1 WHERE pubkey = $1",
            buyer
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "UPDATE escrows SET trade_count_applied = true, updated_at = $2 WHERE escrow_pda = $1",
            escrow_pda,
            updated_at
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn get_escrow(&self, escrow_pda: &str) -> Result<Option<EscrowRow>, sqlx::Error> {
        sqlx::query_as!(
            EscrowRow,
            "SELECT escrow_pda, asset, seller, buyer, cancelled_by, price, state,
                    shipping_commitment, trade_count_applied, created_at, updated_at
             FROM escrows
             WHERE escrow_pda = $1",
            escrow_pda
        )
        .fetch_optional(&self.db_pool)
        .await
    }

    // 查某本书当前活跃的托管（Paid 或 Shipped）
    pub async fn get_active_escrow_by_asset(
        &self,
        asset: &str,
    ) -> Result<Option<EscrowRow>, sqlx::Error> {
        sqlx::query_as!(
            EscrowRow,
            "SELECT escrow_pda, asset, seller, buyer, cancelled_by, price, state,
                    shipping_commitment, trade_count_applied, created_at, updated_at
             FROM escrows
             WHERE asset = $1
               AND state IN ('Paid', 'Shipped')",
            asset
        )
        .fetch_optional(&self.db_pool)
        .await
    }

    // 买家的订单列表
    pub async fn list_buyer_escrows(
        &self,
        buyer: &str,
        page: &Page,
    ) -> Result<Vec<EscrowRow>, sqlx::Error> {
        sqlx::query_as!(
            EscrowRow,
            "SELECT escrow_pda, asset, seller, buyer, cancelled_by, price, state,
                    shipping_commitment, trade_count_applied, created_at, updated_at
             FROM escrows
             WHERE buyer = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3",
            buyer,
            page.limit,
            page.offset
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 卖家的订单列表
    pub async fn list_seller_escrows(
        &self,
        seller: &str,
        page: &Page,
    ) -> Result<Vec<EscrowRow>, sqlx::Error> {
        sqlx::query_as!(
            EscrowRow,
            "SELECT escrow_pda, asset, seller, buyer, cancelled_by, price, state,
                    shipping_commitment, trade_count_applied, created_at, updated_at
             FROM escrows
             WHERE seller = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3",
            seller,
            page.limit,
            page.offset
        )
        .fetch_all(&self.db_pool)
        .await
    }

    /// 对账：近期更新的托管记录（按更新时间倒序）
    pub async fn list_escrows_for_reconcile(
        &self,
        limit: i64,
    ) -> Result<Vec<EscrowRow>, sqlx::Error> {
        sqlx::query_as!(
            EscrowRow,
            "SELECT escrow_pda, asset, seller, buyer, cancelled_by, price, state,
                    shipping_commitment, trade_count_applied, created_at, updated_at
             FROM escrows
             ORDER BY updated_at DESC
             LIMIT $1",
            limit
        )
        .fetch_all(&self.db_pool)
        .await
    }

    /// 链上记录页：全站托管订单（数据库同步）
    pub async fn list_escrow_activity_global(
        &self,
        page: &Page,
    ) -> Result<Vec<EscrowActivityRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowActivityRow>(
            r#"SELECT e.escrow_pda, e.asset, e.seller, e.buyer, e.price, e.state,
                      b.name AS book_name, b.cover_url, e.created_at
               FROM escrows e
               INNER JOIN books b ON b.asset = e.asset
               ORDER BY e.created_at DESC
               LIMIT $1 OFFSET $2"#,
        )
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    /// 链上记录页：仅与某用户相关的托管（买或卖）
    pub async fn list_escrow_activity_for_user(
        &self,
        pubkey: &str,
        page: &Page,
    ) -> Result<Vec<EscrowActivityRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowActivityRow>(
            r#"SELECT e.escrow_pda, e.asset, e.seller, e.buyer, e.price, e.state,
                      b.name AS book_name, b.cover_url, e.created_at
               FROM escrows e
               INNER JOIN books b ON b.asset = e.asset
               WHERE e.buyer = $1 OR e.seller = $1
               ORDER BY e.created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(pubkey)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }
}
