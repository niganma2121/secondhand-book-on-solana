use crate::db::DBService;
use crate::db::review::types::{CreateReviewParams, Review};

impl DBService {
    /// 提交评价（每个 escrow 每个 reviewer 只能评一次，DB UNIQUE 保证）
    pub async fn create_review(&self, p: CreateReviewParams<'_>) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            INSERT INTO reviews (id, escrow_pda, reviewer, reviewee, score, comment, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            "#,
            p.id,
            p.escrow_pda,
            p.reviewer,
            p.reviewee,
            p.score,
            p.comment,
            p.created_at,
        )
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 查某用户收到的所有评价（被评方）
    pub async fn list_reviews_for_user(
        &self,
        reviewee: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Review>, sqlx::Error> {
        sqlx::query_as!(
            Review,
            "SELECT id,escrow_pda,reviewer,reviewee,score,comment,created_at
             FROM reviews WHERE reviewee=$1
             ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            reviewee,
            limit,
            offset,
        )
            .fetch_all(&self.pool)
            .await
    }

    /// 查某 escrow 下当前用户是否已评价（防重复提交）
    pub async fn has_reviewed(
        &self,
        escrow_pda: &str,
        reviewer: &str,
    ) -> Result<bool, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT 1 AS exists FROM reviews WHERE escrow_pda=$1 AND reviewer=$2",
            escrow_pda,
            reviewer,
        )
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.is_some())
    }

    /// 查某用户的平均分（用于主页展示信誉）
    pub async fn get_avg_score(&self, reviewee: &str) -> Result<Option<f64>, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT AVG(score::float8) AS avg FROM reviews WHERE reviewee=$1",
            reviewee
        )
            .fetch_one(&self.pool)
            .await?;
        Ok(row.avg)
    }
}
