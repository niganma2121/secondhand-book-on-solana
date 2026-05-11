use crate::db::types::{BookEventRow, Page};
use crate::db::DBService;
use serde_json::Value;

impl DBService {
    pub async fn insert_book_event(
        &self,
        asset: &str,
        event_type: &str,
        from_owner: Option<&str>,
        to_owner: Option<&str>,
        escrow_pda: Option<&str>,
        tx_signature: Option<&str>,
        actor_pubkey: Option<&str>,
        payload: Option<&Value>,
        created_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO book_events
               (asset, event_type, from_owner, to_owner, escrow_pda, tx_signature, actor_pubkey, payload, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"#,
        )
        .bind(asset)
        .bind(event_type)
        .bind(from_owner)
        .bind(to_owner)
        .bind(escrow_pda)
        .bind(tx_signature)
        .bind(actor_pubkey)
        .bind(payload)
        .bind(created_at)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    pub async fn list_book_events(
        &self,
        asset: &str,
        page: &Page,
    ) -> Result<Vec<BookEventRow>, sqlx::Error> {
        sqlx::query_as::<_, BookEventRow>(
            r#"SELECT id, asset, event_type, from_owner, to_owner, escrow_pda,
                      tx_signature, actor_pubkey, payload, created_at
               FROM book_events
               WHERE asset = $1
               ORDER BY created_at DESC, id DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(asset)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.db_pool)
        .await
    }
}
