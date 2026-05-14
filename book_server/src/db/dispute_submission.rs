use crate::db::types::{EscrowDisputeSubmissionRevisionRow, EscrowDisputeSubmissionRow};
use crate::db::DBService;
use serde_json::Value;

impl DBService {
    /// 写入当前版本并追加一条修订历史（同一事务）。
    pub async fn upsert_escrow_dispute_submission(
        &self,
        escrow_pda: &str,
        initiator: &str,
        public_text: &str,
        public_attachment_urls: &Value,
        private_text: Option<&str>,
        created_at: i64,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        let r = sqlx::query(
            r#"INSERT INTO escrow_dispute_submissions
               (escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (escrow_pda, initiator) DO UPDATE SET
                 public_text = EXCLUDED.public_text,
                 public_attachment_urls = EXCLUDED.public_attachment_urls,
                 private_text = EXCLUDED.private_text,
                 created_at = EXCLUDED.created_at"#,
        )
        .bind(escrow_pda)
        .bind(initiator)
        .bind(public_text)
        .bind(public_attachment_urls)
        .bind(private_text)
        .bind(created_at)
        .execute(&mut *tx)
        .await?;
        if r.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        sqlx::query(
            r#"INSERT INTO escrow_dispute_submission_revisions
               (escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(escrow_pda)
        .bind(initiator)
        .bind(public_text)
        .bind(public_attachment_urls)
        .bind(private_text)
        .bind(created_at)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_escrow_dispute_submissions(
        &self,
        escrow_pda: &str,
    ) -> Result<Vec<EscrowDisputeSubmissionRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowDisputeSubmissionRow>(
            r#"SELECT escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at
               FROM escrow_dispute_submissions WHERE escrow_pda = $1
               ORDER BY created_at ASC"#,
        )
        .bind(escrow_pda)
        .fetch_all(&self.db_pool)
        .await
    }

    pub async fn list_escrow_dispute_submission_revisions(
        &self,
        escrow_pda: &str,
    ) -> Result<Vec<EscrowDisputeSubmissionRevisionRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowDisputeSubmissionRevisionRow>(
            r#"SELECT id, escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at
               FROM escrow_dispute_submission_revisions
               WHERE escrow_pda = $1
               ORDER BY initiator ASC, created_at ASC, id ASC"#,
        )
        .bind(escrow_pda)
        .fetch_all(&self.db_pool)
        .await
    }
}
