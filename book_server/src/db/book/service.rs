use crate::db::book::types::{BookInfo, CreateBookParams};
use crate::db::DBService;

impl DBService {
    pub async fn create_book(&self, p: CreateBookParams<'_>) -> Result<(), sqlx::Error> {
        let now = p.created_at;
        sqlx::query!(
            "INSERT INTO books
            (asset,book_pda,seller,collection,price,status,
             metadata_url,metadata_hash,name,author,series,
             category,condition,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,'Listed',$6,$7,$8,$9,$10,$11,$12,$13,$13)",
            p.asset,
            p.book_pda,
            p.seller,
            p.collection,
            p.price,
            p.metadata_url,
            p.metadata_hash,
            p.name,
            p.author,
            p.series,
            p.category,
            p.condition,
            now,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delist_book(&self, asset: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET status='DeListed', updated_at=$2 WHERE asset=$1",
            asset,
            now
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// 买家创建托管时锁定书籍状态
    pub async fn book_set_in_escrow(&self, asset: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET status='InEscrow', updated_at=$2 WHERE asset=$1",
            asset,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // 交易完成标记为 Sold
    pub async fn book_set_sold(&self, asset: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET status='Sold', updated_at=$2 WHERE asset=$1",
            asset,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 取消托管时恢复为 Listed
    pub async fn book_restore_listed(&self, asset: &str, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET status='Listed', updated_at=$2 WHERE asset=$1",
            asset,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 更新价格（update_price 链上确认后调用）
    pub async fn update_book_price(
        &self,
        asset: &str,
        new_price: i64,
        now: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET price=$2, updated_at=$3 WHERE asset=$1",
            asset,
            new_price,
            now
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 按主键查单本书
    pub async fn get_book(&self, asset: &str) -> Result<Option<BookInfo>, sqlx::Error> {
        sqlx::query_as!(
            BookInfo,
            "SELECT asset,book_pda,seller,collection,price,status,metadata_url,
                    metadata_hash,name,cover_url,author,series,category,condition,
                    created_at,updated_at
             FROM books WHERE asset=$1",
            asset
        )
            .fetch_optional(&self.pool)
            .await
    }

    /// 模糊前缀搜索书名（用于搜索框自动补全）
    pub async fn search_books_by_name(
        &self,
        prefix: &str,
        limit: i64,
    ) -> Result<Vec<BookInfo>, sqlx::Error> {
        let pattern = format!("{}%", prefix);
        sqlx::query_as!(
            BookInfo,
            r#"
            SELECT asset,book_pda,seller,collection,price,status,metadata_url,
                   metadata_hash,name,cover_url,author,series,category,condition,
                   created_at,updated_at
            FROM books
            WHERE status='Listed' AND name LIKE $1
            ORDER BY name
            LIMIT $2
            "#,
            pattern,
            limit,
        )
            .fetch_all(&self.pool)
            .await
    }

    /// 查某个卖家的所有书（含各状态，用于个人主页）
    pub async fn list_books_by_seller(
        &self,
        seller: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BookInfo>, sqlx::Error> {
        sqlx::query_as!(
            BookInfo,
            r#"
            SELECT asset,book_pda,seller,collection,price,status,metadata_url,
                   metadata_hash,name,cover_url,author,series,category,condition,
                   created_at,updated_at
            FROM books
            WHERE seller=$1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            seller,
            limit,
            offset,
        )
            .fetch_all(&self.pool)
            .await
    }
}
