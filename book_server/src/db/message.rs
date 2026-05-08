use crate::db::DBService;
use crate::db::types::{ConversationRow, MessageRow, Page};

impl DBService {
    // 插入消息
    pub async fn insert_message(
        &self,
        id: i64,
        from_pubkey: &str,
        to_pubkey: &str,
        content: &serde_json::Value,
        timestamp: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "INSERT INTO messages (id, from_pubkey, to_pubkey, content, timestamp)
             VALUES ($1, $2, $3, $4, $5)",
            id,
            from_pubkey,
            to_pubkey,
            content,
            timestamp
        )
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    // 拉取离线消息
    // 查 id > after_id 且发给 to_pubkey 的消息
    pub async fn get_offline_messages(
        &self,
        to_pubkey: &str,
        after_id: i64,
    ) -> Result<Vec<MessageRow>, sqlx::Error> {
        sqlx::query_as!(
            MessageRow,
            "SELECT id, from_pubkey, to_pubkey, content, timestamp, is_read
             FROM messages
             WHERE to_pubkey = $1
               AND id > $2
             ORDER BY id ASC",
            to_pubkey,
            after_id
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 查两人之间的对话历史
    pub async fn get_conversation(
        &self,
        user_a: &str,
        user_b: &str,
        page: &Page,
    ) -> Result<Vec<MessageRow>, sqlx::Error> {
        sqlx::query_as!(
            MessageRow,
            "SELECT id, from_pubkey, to_pubkey, content, timestamp, is_read
             FROM messages
             WHERE LEAST(from_pubkey, to_pubkey)    = LEAST($1, $2)
               AND GREATEST(from_pubkey, to_pubkey) = GREATEST($1, $2)
             ORDER BY id ASC
             LIMIT $3 OFFSET $4",
            user_a,
            user_b,
            page.limit,
            page.offset
        )
        .fetch_all(&self.db_pool)
        .await
    }

    // 查用户所有会话列表，每个会话取最新一条 + 未读数
    pub async fn list_conversations(
        &self,
        user_pubkey: &str,
    ) -> Result<Vec<ConversationRow>, sqlx::Error> {
        sqlx::query_as!(
            ConversationRow,
            r#"
            SELECT
                peer_pubkey,
                last_content,
                last_timestamp,
                unread_count
            FROM (
                SELECT
                    CASE
                        WHEN from_pubkey = $1 THEN to_pubkey
                        ELSE from_pubkey
                    END AS peer_pubkey,
                    LAST_VALUE(content)   OVER w AS last_content,
                    LAST_VALUE(timestamp) OVER w AS last_timestamp,
                    COUNT(*) FILTER (WHERE to_pubkey = $1 AND is_read = FALSE) OVER w AS unread_count,
                    ROW_NUMBER() OVER w AS rn
                FROM messages
                WHERE from_pubkey = $1 OR to_pubkey = $1
                WINDOW w AS (
                    PARTITION BY LEAST(from_pubkey, to_pubkey), GREATEST(from_pubkey, to_pubkey)
                    ORDER BY id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                )
            ) sub
            WHERE rn = 1
            ORDER BY last_timestamp DESC
            "#,
            user_pubkey
        )
            .fetch_all(&self.db_pool)
            .await
    }

    // 标记两人对话中发给自己的消息全部已读
    pub async fn mark_conversation_read(
        &self,
        to_pubkey: &str,
        from_pubkey: &str,
    ) -> Result<Option<i64>, sqlx::Error> {
        let row = sqlx::query!(
            "WITH updated AS (
                UPDATE messages
                SET is_read = TRUE
                WHERE to_pubkey = $1
                  AND from_pubkey = $2
                  AND is_read = FALSE
                RETURNING id
             )
             SELECT MAX(id) AS max_id FROM updated",
            to_pubkey,
            from_pubkey
        )
        .fetch_one(&self.db_pool)
        .await?;
        Ok(row.max_id)
    }

    // 查用户总未读消息数
    pub async fn count_unread(&self, to_pubkey: &str) -> Result<i64, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT COUNT(*) AS count
             FROM messages
             WHERE to_pubkey = $1 AND is_read = FALSE",
            to_pubkey
        )
        .fetch_one(&self.db_pool)
        .await?;
        Ok(row.count.unwrap_or(0))
    }
}
