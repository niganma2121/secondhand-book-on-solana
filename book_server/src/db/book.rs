use crate::db::DBService;
use crate::db::types::{BookCardRow, BookDetailRow, BookFilter, BookImageRow, BookSortBy, Page};
use sqlx::QueryBuilder;

impl DBService {
    //插入书籍
    pub async fn insert_book(
        &self,
        asset: &str,
        book_pda: &str,
        seller: &str,
        collection: &str,
        price: i64,
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
        sqlx::query!(
            "INSERT INTO books
                (asset, book_pda, seller, collection, price, metadata_url,
                 metadata_hash, name, cover_url, author, series,
                 category, condition, created_at, updated_at)
             VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)",
            asset,
            book_pda,
            seller,
            collection,
            price,
            metadata_url,
            metadata_hash,
            name,
            cover_url,
            author,
            series,
            category,
            condition,
            created_at
        )
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

    // 更新价格
    pub async fn update_book_price(
        &self,
        asset: &str,
        new_price: i64,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET price = $2, updated_at = $3 WHERE asset = $1",
            asset,
            new_price,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    // 更新书的状态（Listed / Locked / Sold / Delisted）
    pub async fn update_book_status(
        &self,
        asset: &str,
        status: &str,
        updated_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE books SET status = $2, updated_at = $3 WHERE asset = $1",
            asset,
            status,
            updated_at
        )
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    // ================================
    // 读操作
    // ================================

    // 单本书完整详情
    pub async fn get_book_detail(&self, asset: &str) -> Result<Option<BookDetailRow>, sqlx::Error> {
        sqlx::query_as!(
            BookDetailRow,
            "SELECT asset, book_pda, seller, collection, price, status,
                    metadata_url, metadata_hash, name, cover_url, author,
                    series, category, condition, created_at, updated_at
             FROM books
             WHERE asset = $1",
            asset
        )
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
            "SELECT asset, seller, price, status, name, cover_url,
                    author, category, condition, created_at
             FROM books
             WHERE status = 'Listed'",
        );

        if let Some(ref kw) = filter.keyword {
            // 优先全文搜索，兜底用 trgm 模糊
            qb.push(" AND (search_vec @@ to_tsquery('simple', ")
                .push_bind(format!("{}:*", kw))
                .push(") OR name % ")
                .push_bind(kw.as_str())
                .push(")");
        }
        if let Some(ref cat) = filter.category {
            qb.push(" AND category = ").push_bind(cat.as_str());
        }
        if let Some(ref cond) = filter.condition {
            qb.push(" AND condition = ").push_bind(cond.as_str());
        }
        if let Some(min) = filter.min_price {
            qb.push(" AND price >= ").push_bind(min);
        }
        if let Some(max) = filter.max_price {
            qb.push(" AND price <= ").push_bind(max);
        }

        match filter.sort_by {
            BookSortBy::PriceAsc => qb.push(" ORDER BY price ASC,  created_at DESC"),
            BookSortBy::PriceDesc => qb.push(" ORDER BY price DESC, created_at DESC"),
            BookSortBy::Newest => qb.push(" ORDER BY created_at DESC"),
        };

        qb.push(" LIMIT ").push_bind(page.limit);
        qb.push(" OFFSET ").push_bind(page.offset);

        qb.build_query_as::<BookCardRow>()
            .fetch_all(&self.db_pool)
            .await
    }

    // 某个卖家上架的书（个人主页用）
    pub async fn list_seller_books(
        &self,
        seller: &str,
        page: &Page,
    ) -> Result<Vec<BookCardRow>, sqlx::Error> {
        sqlx::query_as!(
            BookCardRow,
            "SELECT asset, seller, price, status, name, cover_url,
                    author, category, condition, created_at
             FROM books
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

    // 用户买过的书（通过 escrows 关联，状态 Completed）
    pub async fn list_bought_books(
        &self,
        buyer: &str,
        page: &Page,
    ) -> Result<Vec<BookCardRow>, sqlx::Error> {
        sqlx::query_as!(
            BookCardRow,
            "SELECT b.asset, b.seller, b.price, b.status, b.name,
                    b.cover_url, b.author, b.category, b.condition, b.created_at
             FROM books b
             INNER JOIN escrows e ON e.asset = b.asset
             WHERE e.buyer = $1
               AND e.state = 'Completed'
             ORDER BY e.created_at DESC
             LIMIT $2 OFFSET $3",
            buyer,
            page.limit,
            page.offset
        )
        .fetch_all(&self.db_pool)
        .await
    }
}
