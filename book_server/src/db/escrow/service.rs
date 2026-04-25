use crate::db::DBService;
use crate::db::escrow::types::{CreateEscrowParams, EscrowInfo};

impl DBService {
    /// 买家付款，创建托管记录（create_escrow 链上确认后）
    pub async fn create_escrow(&self, p: CreateEscrowParams<'_>) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            INSERT INTO escrows
                (escrow_pda, asset, seller, buyer, price, state, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,'Paid',$6,$6)
            "#,
            p.escrow_pda,
            p.asset,
            p.seller,
            p.buyer,
            p.price,
            p.created_at,
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 卖家发货，记录物流承诺哈希（ship_book 链上确认后）
    pub async fn escrow_set_shipped(
        &self,
        escrow_pda: &str,
        shipping_commitment: &[u8],
        now: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE escrows SET state='Shipped', shipping_commitment=$2, updated_at=$3
             WHERE escrow_pda=$1",
            escrow_pda,
            shipping_commitment,
            now,
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 买家确认收货，释放资金（confirm_escrow 链上确认后）
    pub async fn escrow_set_released(&self, escrow_pda: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE escrows SET state='Released', updated_at=$2 WHERE escrow_pda=$1",
            escrow_pda,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 取消托管（cancel_escrow 链上确认后）
    pub async fn escrow_set_cancelled(&self, escrow_pda: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE escrows SET state='Cancelled', updated_at=$2 WHERE escrow_pda=$1",
            escrow_pda,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 开启仲裁（open_dispute 链上确认后）
    pub async fn escrow_set_disputed(&self, escrow_pda: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE escrows SET state='Disputed', updated_at=$2 WHERE escrow_pda=$1",
            escrow_pda,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 按主键查单个托管
    pub async fn get_escrow(&self, escrow_pda: &str) -> Result<Option<EscrowInfo>, sqlx::Error> {
        sqlx::query_as!(
            EscrowInfo,
            "SELECT escrow_pda,asset,seller,buyer,price,state,
                    shipping_commitment,created_at,updated_at
             FROM escrows WHERE escrow_pda=$1",
            escrow_pda
        )
            .fetch_optional(&self.pool)
            .await
    }

    /// 查买家的所有托管订单
    pub async fn list_escrows_by_buyer(
        &self,
        buyer: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<EscrowInfo>, sqlx::Error> {
        sqlx::query_as!(
            EscrowInfo,
            "SELECT escrow_pda,asset,seller,buyer,price,state,
                    shipping_commitment,created_at,updated_at
             FROM escrows WHERE buyer=$1
             ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            buyer,
            limit,
            offset,
        )
            .fetch_all(&self.pool)
            .await
    }

    /// 查卖家的所有托管订单
    pub async fn list_escrows_by_seller(
        &self,
        seller: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<EscrowInfo>, sqlx::Error> {
        sqlx::query_as!(
            EscrowInfo,
            "SELECT escrow_pda,asset,seller,buyer,price,state,
                    shipping_commitment,created_at,updated_at
             FROM escrows WHERE seller=$1
             ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            seller,
            limit,
            offset,
        )
            .fetch_all(&self.pool)
            .await
    }

    /// 查某个 asset 当前活跃的托管（状态为 Paid / Shipped / Disputed）
    pub async fn get_active_escrow_by_asset(
        &self,
        asset: &str,
    ) -> Result<Option<EscrowInfo>, sqlx::Error> {
        sqlx::query_as!(
            EscrowInfo,
            "SELECT escrow_pda,asset,seller,buyer,price,state,
                    shipping_commitment,created_at,updated_at
             FROM escrows
             WHERE asset=$1 AND state IN ('Paid','Shipped','Disputed')
             LIMIT 1",
            asset
        )
            .fetch_optional(&self.pool)
            .await
    }
}