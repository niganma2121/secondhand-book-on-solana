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