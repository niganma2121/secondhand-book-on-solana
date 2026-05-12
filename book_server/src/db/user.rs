use crate::client::ArbitrationResult;
use crate::db::DBService;
use crate::db::types::UserRow;

impl DBService {
    pub async fn count_users(&self) -> Result<i64, sqlx::Error> {
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*)::bigint FROM users")
            .fetch_one(&self.db_pool)
            .await?;
        Ok(count)
    }

    // 查用户，不存在返回 None
    pub async fn get_user(&self, pubkey: &str) -> Result<Option<UserRow>, sqlx::Error> {
        sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE pubkey = $1")
            .bind(pubkey)
            .fetch_optional(&self.db_pool)
            .await
    }

    // 首次登录插入用户，已存在则忽略
    pub async fn insert_user(&self, pubkey: &str, created_at: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "INSERT INTO users (pubkey, created_at)
             VALUES ($1, $2)
             ON CONFLICT (pubkey) DO NOTHING",
            pubkey,
            created_at
        )
            .execute(&self.db_pool)
            .await?;
        Ok(())
    }

    // 更新用户名和头像（传 None 表示不改该字段）
    pub async fn update_user_profile(
        &self,
        pubkey:   &str,
        username: Option<&str>,
        avatar:   Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE users
             SET username = COALESCE($2, username),
                 avatar   = COALESCE($3, avatar)
             WHERE pubkey = $1",
            pubkey,
            username,
            avatar
        )
            .execute(&self.db_pool)
            .await?;
        Ok(())
    }

    /// 仲裁结案后更新买卖双方：各计一次参与，`won` 方 +5 分，`lost` 方 −5 分， clamp 到 [0,100]。
    async fn bump_user_dispute_outcome(&self, pubkey: &str, won: bool) -> Result<(), sqlx::Error> {
        let win_inc: i32 = if won { 1 } else { 0 };
        let lost_inc: i32 = if won { 0 } else { 1 };
        let delta: f64 = if won { 5.0 } else { -5.0 };
        sqlx::query(
            r#"UPDATE users SET
                dispute_total = dispute_total + 1,
                dispute_won = dispute_won + $2,
                dispute_lost = dispute_lost + $3,
                reputation_score = LEAST(
                    100.0::double precision,
                    GREATEST(0.0::double precision, reputation_score + $4)
                )
               WHERE pubkey = $1"#,
        )
        .bind(pubkey)
        .bind(win_inc)
        .bind(lost_inc)
        .bind(delta)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    /// 在链上 `DisputeResolvedEvent` 同步后调用；`Voting` 不修改统计。
    pub async fn apply_dispute_resolution_reputation(
        &self,
        seller: &str,
        buyer: &str,
        result: ArbitrationResult,
    ) -> Result<(), sqlx::Error> {
        match result {
            ArbitrationResult::BuyerWin => {
                self.bump_user_dispute_outcome(buyer, true).await?;
                self.bump_user_dispute_outcome(seller, false).await?;
            }
            ArbitrationResult::SellerWin => {
                self.bump_user_dispute_outcome(seller, true).await?;
                self.bump_user_dispute_outcome(buyer, false).await?;
            }
            ArbitrationResult::Voting => {}
        }
        Ok(())
    }

    pub async fn upsert_user_encryption_pubkey(
        &self,
        pubkey: &str,
        enc_pubkey: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE users
             SET enc_pubkey = $2
             WHERE pubkey = $1"
        )
        .bind(pubkey)
        .bind(enc_pubkey)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }
}