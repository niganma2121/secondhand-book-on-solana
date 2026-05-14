use crate::db::DBService;
use crate::db::types::Page;
use serde::{Deserialize, Serialize};
use sqlx::QueryBuilder;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct ReviewRow {
    pub id:         i64,
    pub escrow_pda: String,
    pub reviewer:   String,
    pub reviewee:   String,
    pub score:      i16,
    pub comment:    Option<String>,
    pub created_at: i64,
}

// 信誉聚合数据
#[derive(Debug, Serialize)]
pub struct ReputationRow {
    pub review_count: i64,
    pub avg_score:    f64,
    pub good_count:   i64, // score >= 4 的数量
}

impl DBService {
    // 插入评价
    pub async fn insert_review(
        &self,
        id:         i64,
        escrow_pda: &str,
        reviewer:   &str,
        reviewee:   &str,
        score:      i16,
        comment:    Option<&str>,
        created_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "INSERT INTO reviews (id, escrow_pda, reviewer, reviewee, score, comment, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
            id, escrow_pda, reviewer, reviewee, score, comment, created_at
        )
            .execute(&self.db_pool)
            .await?;
        Ok(())
    }

    // 查某用户收到的评价列表（分页）
    pub async fn list_user_reviews(
        &self,
        reviewee: &str,
        page:     &Page,
    ) -> Result<Vec<ReviewRow>, sqlx::Error> {
        sqlx::query_as!(
            ReviewRow,
            "SELECT id, escrow_pda, reviewer, reviewee, score, comment, created_at
             FROM reviews
             WHERE reviewee = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3",
            reviewee, page.limit, page.offset
        )
            .fetch_all(&self.db_pool)
            .await
    }

    // 查某个托管订单的评价
    pub async fn get_escrow_review(
        &self,
        escrow_pda: &str,
        reviewer:   &str,
    ) -> Result<Option<ReviewRow>, sqlx::Error> {
        sqlx::query_as!(
            ReviewRow,
            "SELECT id, escrow_pda, reviewer, reviewee, score, comment, created_at
             FROM reviews
             WHERE escrow_pda = $1 AND reviewer = $2",
            escrow_pda, reviewer
        )
            .fetch_optional(&self.db_pool)
            .await
    }

    /// 在给定 `escrow_pda` 列表中，返回已由 `reviewer` 提交过评价的托管 PDA。
    pub async fn escrow_pdas_reviewed_by(
        &self,
        reviewer:     &str,
        escrow_pdas:  &[String],
    ) -> Result<Vec<String>, sqlx::Error> {
        if escrow_pdas.is_empty() {
            return Ok(vec![]);
        }
        let mut qb = QueryBuilder::new("SELECT escrow_pda FROM reviews WHERE reviewer = ");
        qb.push_bind(reviewer);
        qb.push(" AND escrow_pda IN (");
        {
            let mut sep = qb.separated(", ");
            for p in escrow_pdas {
                sep.push_bind(p);
            }
        }
        qb.push(")");
        qb.build_query_scalar::<String>()
            .fetch_all(&self.db_pool)
            .await
    }

    // 查用户信誉聚合数据
    pub async fn get_reputation(
        &self,
        reviewee: &str,
    ) -> Result<Option<ReputationRow>, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT
                COUNT(*)                                    AS review_count,
                COALESCE(AVG(score::float8), 0.0)          AS avg_score,
                COUNT(*) FILTER (WHERE score >= 4)         AS good_count
             FROM reviews
             WHERE reviewee = $1",
            reviewee
        )
            .fetch_one(&self.db_pool)
            .await?;

        // 没有任何评价时返回 None
        if row.review_count.unwrap_or(0) == 0 {
            return Ok(None);
        }

        Ok(Some(ReputationRow {
            review_count: row.review_count.unwrap_or(0),
            avg_score:    row.avg_score.unwrap_or(0.0),
            good_count:   row.good_count.unwrap_or(0),
        }))
    }
}