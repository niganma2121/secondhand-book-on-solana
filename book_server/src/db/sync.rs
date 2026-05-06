use crate::db::DBService;

impl DBService {
    /// 事件幂等落库；返回 true 表示首次插入，false 表示重复事件。
    pub async fn try_insert_chain_event_dedup(
        &self,
        signature: &str,
        slot: i64,
        log_index: i32,
        event_name: &str,
        created_at: i64,
    ) -> Result<bool, sqlx::Error> {
        let rows = sqlx::query(
            "INSERT INTO chain_events_dedup (signature, slot, log_index, event_name, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (signature, log_index) DO NOTHING",
        )
        .bind(signature)
        .bind(slot)
        .bind(log_index)
        .bind(event_name)
        .bind(created_at)
        .execute(&self.db_pool)
        .await?
        .rows_affected();
        Ok(rows > 0)
    }

    pub async fn set_chain_cursor(&self, key: &str, last_slot: i64, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO chain_event_cursors (key, last_slot, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (key)
             DO UPDATE SET last_slot = EXCLUDED.last_slot, updated_at = EXCLUDED.updated_at",
        )
        .bind(key)
        .bind(last_slot)
        .bind(now)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    pub async fn get_chain_cursor(&self, key: &str) -> Result<Option<i64>, sqlx::Error> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT last_slot FROM chain_event_cursors WHERE key = $1",
        )
        .bind(key)
        .fetch_optional(&self.db_pool)
        .await?;
        Ok(row)
    }

    pub async fn start_reconcile_run(
        &self,
        started_at: i64,
        from_slot: i64,
        to_slot: i64,
    ) -> Result<i64, sqlx::Error> {
        let row_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO reconcile_runs (started_at, from_slot, to_slot, status)
             VALUES ($1, $2, $3, 'running')
             RETURNING id",
        )
        .bind(started_at)
        .bind(from_slot)
        .bind(to_slot)
        .fetch_one(&self.db_pool)
        .await?;
        Ok(row_id)
    }

    pub async fn finish_reconcile_run(
        &self,
        run_id: i64,
        finished_at: i64,
        scanned_count: i32,
        repaired_count: i32,
        mismatch_count: i32,
        error_message: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let status = if error_message.is_some() { "failed" } else { "ok" };
        sqlx::query(
            "UPDATE reconcile_runs
             SET finished_at = $2,
                 scanned_count = $3,
                 repaired_count = $4,
                 mismatch_count = $5,
                 status = $6,
                 error_message = $7
             WHERE id = $1",
        )
        .bind(run_id)
        .bind(finished_at)
        .bind(scanned_count)
        .bind(repaired_count)
        .bind(mismatch_count)
        .bind(status)
        .bind(error_message)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }
}
