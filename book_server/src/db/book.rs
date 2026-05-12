use crate::db::DBService;
use crate::db::types::{
    BookCardRow, BookCategoryRow, BookConditionRow, BookDetailRow, BookFilter, BookImageRow,
    BookSortBy, BoughtBookRow, Page,
};
use sqlx::QueryBuilder;

impl DBService {
    /// 在售书籍数量（status = 'Listed'）
    pub async fn count_listed_books(&self) -> Result<i64, sqlx::Error> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::bigint FROM books WHERE status = 'Listed'",
        )
        .fetch_one(&self.db_pool)
        .await?;
        Ok(count)
    }

    //插入书籍
    pub async fn insert_book(
        &self,
        asset: &str,
        book_pda: &str,
        seller: &str,
        collection: &str,
        price: i64,
        price_cny: Option<f64>,
        fx_cny_per_sol: Option<f64>,
        metadata_url: &str,
        metadata_hash: &[u8],
        name: &str,
        cover_url: Option<&str>,
        author: Option<&str>,
        series: Option<&str>,
        category: &str,
        condition: &str,
        created_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO books
                (asset, book_pda, seller, collection, price, price_cny, fx_cny_per_sol, metadata_url,
                 metadata_hash, name, cover_url, author, series,
                 category, condition, created_at, updated_at)
             VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)",
        )
        .bind(asset)
        .bind(book_pda)
        .bind(seller)
        .bind(collection)
        .bind(price)
        .bind(price_cny)
        .bind(fx_cny_per_sol)
        .bind(metadata_url)
        .bind(metadata_hash)
        .bind(name)
        .bind(cover_url)
        .bind(author)
        .bind(series)
        .bind(category)
        .bind(condition)
        .bind(created_at)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    //图片
    pub async fn insert_book_images(
        &self,
        images: &[(i64, &str, &str, i16, i64)], // (id, asset, url, sort, created_at)
    ) -> Result<(), sqlx::Error> {
        let mut qb =
            QueryBuilder::new("INSERT INTO book_images (id, asset, url, sort, created_at) ");
        qb.push_values(images, |mut b, (id, asset, url, sort, created_at)| {
            b.push_bind(id)
                .push_bind(asset)
                .push_bind(url)
                .push_bind(sort)
                .push_bind(created_at);
        });
        qb.build().execute(&self.db_pool).await?;
        Ok(())
    }

    pub async fn replace_book_images(
        &self,
        asset: &str,
        images: &[(i64, &str, &str, i16, i64)],
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        sqlx::query("DELETE FROM book_images WHERE asset = $1")
            .bind(asset)
            .execute(&mut *tx)
            .await?;

        if !images.is_empty() {
            let mut qb =
                QueryBuilder::new("INSERT INTO book_images (id, asset, url, sort, created_at) ");
            qb.push_values(images, |mut b, (id, asset, url, sort, created_at)| {
                b.push_bind(id)
                    .push_bind(asset)
                    .push_bind(url)
                    .push_bind(sort)
                    .push_bind(created_at);
            });
            qb.build().execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn update_book_for_relist(
        &self,
        asset: &str,
        seller: &str,
        price: i64,
        price_cny: Option<f64>,
        fx_cny_per_sol: Option<f64>,
        metadata_url: &str,
        metadata_hash: &[u8],
        name: &str,
        cover_url: Option<&str>,
        author: Option<&str>,
        series: Option<&str>,
        category: &str,
        condition: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let result = sqlx::query(
            "UPDATE books
             SET seller = $2,
                 price = $3,
                 price_cny = $4,
                 fx_cny_per_sol = $5,
                 metadata_url = $6,
                 metadata_hash = $7,
                 name = $8,
                 cover_url = $9,
                 author = $10,
                 series = $11,
                 category = $12,
                 condition = $13,
                 status = 'Listed',
                 updated_at = $14
             WHERE asset = $1",
        )
        .bind(asset)
        .bind(seller)
        .bind(price)
        .bind(price_cny)
        .bind(fx_cny_per_sol)
        .bind(metadata_url)
        .bind(metadata_hash)
        .bind(name)
        .bind(cover_url)
        .bind(author)
        .bind(series)
        .bind(category)
        .bind(condition)
        .bind(updated_at)
        .execute(&self.db_pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // 更新价格
    pub async fn update_book_price(
        &self,
        asset: &str,
        new_price: i64,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE books SET price = $2, updated_at = $3 WHERE asset = $1",
            asset,
            new_price,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    /// 与链上一致：仅更新 IPFS 元数据指针（对账用）
    pub async fn update_book_metadata_mirror(
        &self,
        asset: &str,
        metadata_url: &str,
        metadata_hash: &[u8],
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let result = sqlx::query(
            "UPDATE books SET metadata_url = $2, metadata_hash = $3, updated_at = $4 WHERE asset = $1",
        )
        .bind(asset)
        .bind(metadata_url)
        .bind(metadata_hash)
        .bind(updated_at)
        .execute(&self.db_pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    /// 默认分类 key（链上补偿入库时用）
    pub async fn pick_default_book_category_key(&self) -> Result<String, sqlx::Error> {
        let row = sqlx::query_scalar::<_, String>(
            "SELECT key FROM book_categories ORDER BY sort_order ASC LIMIT 1",
        )
        .fetch_optional(&self.db_pool)
        .await?;
        Ok(row.unwrap_or_else(|| "other".into()))
    }

    /// 近期更新过的书籍 asset（按时间与链上 Book 镜像对账）
    pub async fn list_recent_book_assets(&self, limit: i64) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar!(
            r#"SELECT asset FROM books ORDER BY updated_at DESC LIMIT $1"#,
            limit
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 更新书的状态（Listed / Locked / Sold / Delisted）
    pub async fn update_book_status(
        &self,
        asset: &str,
        status: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE books SET status = $2, updated_at = $3 WHERE asset = $1",
            asset,
            status,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // ================================
    // 读操作
    // ================================

    /// 按书籍状态列出 asset（用于链上对账）
    pub async fn list_assets_by_book_status(
        &self,
        status: &str,
        limit: i64,
    ) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar!(
            r#"SELECT asset FROM books WHERE status = $1 ORDER BY updated_at DESC LIMIT $2"#,
            status,
            limit
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 单本书完整详情（category 为字典中文名，便于展示）
    pub async fn get_book_detail(&self, asset: &str) -> Result<Option<BookDetailRow>, sqlx::Error> {
        sqlx::query_as::<_, BookDetailRow>(
            r#"SELECT b.asset, b.book_pda, b.seller, b.collection, b.price, b.price_cny, b.fx_cny_per_sol, b.status,
                      b.metadata_url, b.metadata_hash, b.name, b.cover_url, b.author, b.series,
                      COALESCE(bc.label_zh, b.category) AS category,
                      COALESCE(bcond.label_zh, b.condition) AS condition,
                      b.created_at, b.updated_at
               FROM books b
               LEFT JOIN book_categories bc ON b.category = bc.key
               LEFT JOIN book_conditions bcond ON b.condition = bcond.key
               WHERE b.asset = $1"#,
        )
        .bind(asset)
        .fetch_optional(&self.db_pool)
        .await
    }

    // 单本书的所有图片
    pub async fn get_book_images(&self, asset: &str) -> Result<Vec<BookImageRow>, sqlx::Error> {
        sqlx::query_as!(
            BookImageRow,
            "SELECT id, asset, url, sort, created_at
             FROM book_images
             WHERE asset = $1
             ORDER BY sort ASC",
            asset
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 市场列表，支持多条件筛选 + 排序 + 分页
    // 条件不固定，只能用 QueryBuilder 动态拼接
    pub async fn list_market_books(
        &self,
        filter: &BookFilter,
        page: &Page,
    ) -> Result<Vec<BookCardRow>, sqlx::Error> {
        let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            "SELECT b.asset, b.seller, b.price, b.status, b.name, b.cover_url,
                    b.price_cny, b.fx_cny_per_sol,
                    b.author, COALESCE(bc.label_zh, b.category) AS category,
                    COALESCE(bcond.label_zh, b.condition) AS condition, b.created_at,
                    u.username AS seller_username
             FROM books b
             LEFT JOIN book_categories bc ON b.category = bc.key
             LEFT JOIN book_conditions bcond ON b.condition = bcond.key
             LEFT JOIN users u ON b.seller = u.pubkey
             WHERE b.status = 'Listed'",
        );

        if let Some(ref kw) = filter.keyword {
            // 优先全文搜索，兜底用 trgm 模糊
            qb.push(" AND (b.search_vec @@ to_tsquery('simple', ")
                .push_bind(format!("{}:*", kw))
                .push(") OR b.name % ")
                .push_bind(kw.as_str())
                .push(")");
        }
        if let Some(ref cat) = filter.category {
            qb.push(" AND b.category = ").push_bind(cat.as_str());
        }
        if let Some(ref cond) = filter.condition {
            qb.push(" AND b.condition = ").push_bind(cond.as_str());
        }
        if let Some(min) = filter.min_price {
            qb.push(" AND b.price >= ").push_bind(min);
        }
        if let Some(max) = filter.max_price {
            qb.push(" AND b.price <= ").push_bind(max);
        }

        match filter.sort_by {
            BookSortBy::PriceAsc => qb.push(" ORDER BY b.price ASC,  b.created_at DESC"),
            BookSortBy::PriceDesc => qb.push(" ORDER BY b.price DESC, b.created_at DESC"),
            BookSortBy::Newest => qb.push(" ORDER BY b.created_at DESC"),
        };

        qb.push(" LIMIT ").push_bind(page.limit);
        qb.push(" OFFSET ").push_bind(page.offset);

        qb.build_query_as::<BookCardRow>()
            .fetch_all(&self.db_pool)
            .await
    }

    /// 上架页 / 筛选项：从数据库读取分类（`books.category` 存 `key`）
    pub async fn list_book_categories(&self) -> Result<Vec<BookCategoryRow>, sqlx::Error> {
        sqlx::query_as::<_, BookCategoryRow>(
            "SELECT key, label_zh, sort_order FROM book_categories ORDER BY sort_order ASC",
        )
        .fetch_all(&self.db_pool)
        .await
    }

    /// 上架页 / 筛选项：从数据库读取品相（`books.condition` 存 `key`）
    pub async fn list_book_conditions(&self) -> Result<Vec<BookConditionRow>, sqlx::Error> {
        sqlx::query_as::<_, BookConditionRow>(
            "SELECT key, label_zh, description_zh, sort_order FROM book_conditions ORDER BY sort_order ASC",
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 某个卖家上架的书（个人主页用）
    pub async fn list_seller_books(
        &self,
        seller: &str,
        page: &Page,
    ) -> Result<Vec<BookCardRow>, sqlx::Error> {
        sqlx::query_as::<_, BookCardRow>(
            r#"SELECT b.asset, b.seller, b.price, b.price_cny, b.fx_cny_per_sol, b.status, b.name, b.cover_url,
                      b.author, COALESCE(bc.label_zh, b.category) AS category,
                      COALESCE(bcond.label_zh, b.condition) AS condition, b.created_at,
                      u.username AS seller_username
               FROM books b
               LEFT JOIN book_categories bc ON b.category = bc.key
               LEFT JOIN book_conditions bcond ON b.condition = bcond.key
               LEFT JOIN users u ON b.seller = u.pubkey
               WHERE b.seller = $1
               ORDER BY b.created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(seller)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    // 用户买过的书（通过 escrows 关联，成交完成态 Released）
    pub async fn list_bought_books(
        &self,
        buyer: &str,
        page: &Page,
    ) -> Result<Vec<BoughtBookRow>, sqlx::Error> {
        sqlx::query_as::<_, BoughtBookRow>(
            r#"SELECT b.asset, b.seller, b.price, b.price_cny, b.fx_cny_per_sol, b.status, b.name,
                      b.cover_url, b.author,
                      COALESCE(bc.label_zh, b.category) AS category,
                      COALESCE(bcond.label_zh, b.condition) AS condition,
                      b.created_at,
                      u.username AS seller_username,
                      COALESCE(last_released.buyer = $1, b.seller = $1) AS is_current_owner
               FROM books b
               INNER JOIN escrows e ON e.asset = b.asset
               LEFT JOIN LATERAL (
                   SELECT e2.buyer
                   FROM escrows e2
                   WHERE e2.asset = b.asset
                     AND e2.state = 'Released'
                   ORDER BY e2.updated_at DESC, e2.created_at DESC
                   LIMIT 1
               ) AS last_released ON TRUE
               LEFT JOIN book_categories bc ON b.category = bc.key
               LEFT JOIN book_conditions bcond ON b.condition = bcond.key
               LEFT JOIN users u ON b.seller = u.pubkey
               WHERE e.buyer = $1
                 AND e.state = 'Released'
               ORDER BY e.created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(buyer)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }

    /// 用户创建过的书（第一任主人视角）
    pub async fn list_created_books(
        &self,
        creator: &str,
        page: &Page,
    ) -> Result<Vec<BookCardRow>, sqlx::Error> {
        sqlx::query_as::<_, BookCardRow>(
            r#"SELECT b.asset, b.seller, b.price, b.price_cny, b.fx_cny_per_sol, b.status, b.name,
                      b.cover_url, b.author,
                      COALESCE(bc.label_zh, b.category) AS category,
                      COALESCE(bcond.label_zh, b.condition) AS condition,
                      b.created_at,
                      u.username AS seller_username
               FROM books b
               INNER JOIN book_events be ON be.asset = b.asset
               LEFT JOIN book_categories bc ON b.category = bc.key
               LEFT JOIN book_conditions bcond ON b.condition = bcond.key
               LEFT JOIN users u ON b.seller = u.pubkey
               WHERE be.event_type = 'book_created'
                 AND be.to_owner = $1
               ORDER BY be.created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(creator)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }
}
