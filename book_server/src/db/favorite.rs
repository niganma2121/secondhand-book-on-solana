use crate::db::DBService;
use crate::db::types::BookCardRow;

impl DBService {
    // 添加收藏
    pub async fn add_favorite(
        &self,
        user_pubkey: &str,
        asset:       &str,
        created_at:  i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "INSERT INTO favorites (user_pubkey, asset, created_at)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
            user_pubkey, asset, created_at
        )
            .execute(&self.db_pool)
            .await?;
        Ok(())
    }

    // 取消收藏
    pub async fn remove_favorite(
        &self,
        user_pubkey: &str,
        asset:       &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "DELETE FROM favorites WHERE user_pubkey = $1 AND asset = $2",
            user_pubkey, asset
        )
            .execute(&self.db_pool)
            .await?;
        Ok(())
    }

    // 查某本书是否被当前用户收藏
    pub async fn is_favorited(
        &self,
        user_pubkey: &str,
        asset:       &str,
    ) -> Result<bool, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT 1 AS exists FROM favorites WHERE user_pubkey = $1 AND asset = $2",
            user_pubkey, asset
        )
            .fetch_optional(&self.db_pool)
            .await?;
        Ok(row.is_some())
    }

    // 查用户收藏的书列表（返回卡片信息）
    pub async fn list_user_favorites(
        &self,
        user_pubkey: &str,
        page:        &crate::db::types::Page,
    ) -> Result<Vec<BookCardRow>, sqlx::Error> {
        sqlx::query_as::<_, BookCardRow>(
            r#"SELECT b.asset, b.seller, b.price, b.price_cny, b.fx_cny_per_sol, b.status, b.name,
                      b.cover_url, b.author,
                      COALESCE(bc.label_zh, b.category) AS category,
                      COALESCE(bcond.label_zh, b.condition) AS condition,
                      b.created_at,
                      u.username AS seller_username
               FROM books b
               INNER JOIN favorites f ON f.asset = b.asset
               LEFT JOIN book_categories bc ON b.category = bc.key
               LEFT JOIN book_conditions bcond ON b.condition = bcond.key
               LEFT JOIN users u ON b.seller = u.pubkey
               WHERE f.user_pubkey = $1
               ORDER BY f.created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(user_pubkey)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    // 查某本书被多少人收藏
    pub async fn count_favorites(
        &self,
        asset: &str,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT COUNT(*) AS count FROM favorites WHERE asset = $1",
            asset
        )
            .fetch_one(&self.db_pool)
            .await?;
        Ok(row.count.unwrap_or(0))
    }
}