use crate::db::DBService;
use crate::db::user::types::User;

impl DBService {
    /// 用户首次登录时 upsert（钱包登录，pubkey 即主键）
    pub async fn upsert_user(&self, pubkey: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            INSERT INTO users (pubkey, created_at)
            VALUES ($1, $2)
            ON CONFLICT (pubkey) DO NOTHING
            "#,
            pubkey,
            now,
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 查单个用户
    pub async fn get_user(&self, pubkey: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as!(
            User,
            "SELECT pubkey,username,avatar,trade_count,sell_count,buy_count,created_at
             FROM users WHERE pubkey=$1",
            pubkey
        )
            .fetch_optional(&self.pool)
            .await
    }

    /// 更新用户名和头像
    pub async fn update_profile(
        &self,
        pubkey: &str,
        username: Option<&str>,
        avatar: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE users SET username=$2, avatar=$3 WHERE pubkey=$1",
            pubkey,
            username,
            avatar,
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 交易完成时原子更新双方计数
    /// seller: sell_count+1, trade_count+1
    /// buyer:  buy_count+1,  trade_count+1
    pub async fn increment_trade_counts(
        &self,
        seller: &str,
        buyer: &str,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        sqlx::query!(
            "UPDATE users SET sell_count=sell_count+1, trade_count=trade_count+1
             WHERE pubkey=$1",
            seller,
        )
            .execute(&mut *tx)
            .await?;

        sqlx::query!(
            "UPDATE users SET buy_count=buy_count+1, trade_count=trade_count+1
             WHERE pubkey=$1",
            buyer,
        )
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    /// 按用户名精确查找（用于检查是否重名）
    pub async fn get_user_by_username(&self, username: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as!(
            User,
            "SELECT pubkey,username,avatar,trade_count,sell_count,buy_count,created_at
             FROM users WHERE username=$1",
            username
        )
            .fetch_optional(&self.pool)
            .await
    }
}
