use crate::db::DBService;
use crate::db::types::UserRow;

impl DBService {
    // 查用户，不存在返回 None
    pub async fn get_user(&self, pubkey: &str) -> Result<Option<UserRow>, sqlx::Error> {
        sqlx::query_as!(
            UserRow,
            "SELECT * FROM users WHERE pubkey = $1",
            pubkey
        )
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

    // 交易完成后更新计数，seller 和 buyer 各自递增
    pub async fn increment_trade_counts(
        &self,
        seller: &str,
        buyer:  &str,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;

        sqlx::query!(
            "UPDATE users
             SET trade_count = trade_count + 1,
                 sell_count  = sell_count  + 1
             WHERE pubkey = $1",
            seller
        )
            .execute(&mut *tx)
            .await?;

        sqlx::query!(
            "UPDATE users
             SET trade_count = trade_count + 1,
                 buy_count   = buy_count   + 1
             WHERE pubkey = $1",
            buyer
        )
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}