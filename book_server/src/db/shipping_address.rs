use crate::db::DBService;
use crate::db::types::UserShippingAddressRow;

impl DBService {
    pub async fn list_user_shipping_addresses(
        &self,
        user_pubkey: &str,
    ) -> Result<Vec<UserShippingAddressRow>, sqlx::Error> {
        sqlx::query_as::<_, UserShippingAddressRow>(
            r#"SELECT id, user_pubkey, buyer_ciphertext, buyer_nonce, buyer_alg,
                      encryption_key_version,
                      is_default, created_at, updated_at
               FROM user_shipping_ciphertexts
               WHERE user_pubkey = $1
               ORDER BY is_default DESC, id DESC"#,
        )
        .bind(user_pubkey)
        .fetch_all(&self.db_pool)
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_user_shipping_address(
        &self,
        user_pubkey: &str,
        buyer_ciphertext: &str,
        buyer_nonce: &str,
        buyer_alg: &str,
        encryption_key_version: &str,
        is_default: bool,
        now: i64,
    ) -> Result<UserShippingAddressRow, sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        if is_default {
            sqlx::query(
                "UPDATE user_shipping_ciphertexts
                 SET is_default = FALSE, updated_at = $2
                 WHERE user_pubkey = $1 AND is_default = TRUE",
            )
            .bind(user_pubkey)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        }
        let row = sqlx::query_as::<_, UserShippingAddressRow>(
            r#"INSERT INTO user_shipping_ciphertexts
               (user_pubkey, buyer_ciphertext, buyer_nonce, buyer_alg, encryption_key_version,
                is_default, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
               RETURNING id, user_pubkey, buyer_ciphertext, buyer_nonce, buyer_alg,
                         encryption_key_version,
                         is_default, created_at, updated_at"#,
        )
        .bind(user_pubkey)
        .bind(buyer_ciphertext)
        .bind(buyer_nonce)
        .bind(buyer_alg)
        .bind(encryption_key_version)
        .bind(is_default)
        .bind(now)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(row)
    }

    pub async fn get_user_shipping_address(
        &self,
        user_pubkey: &str,
        id: i64,
    ) -> Result<Option<UserShippingAddressRow>, sqlx::Error> {
        sqlx::query_as::<_, UserShippingAddressRow>(
            r#"SELECT id, user_pubkey, buyer_ciphertext, buyer_nonce, buyer_alg,
                      encryption_key_version,
                      is_default, created_at, updated_at
               FROM user_shipping_ciphertexts
               WHERE user_pubkey = $1 AND id = $2"#,
        )
        .bind(user_pubkey)
        .bind(id)
        .fetch_optional(&self.db_pool)
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_user_shipping_address(
        &self,
        user_pubkey: &str,
        id: i64,
        buyer_ciphertext: &str,
        buyer_nonce: &str,
        buyer_alg: &str,
        encryption_key_version: &str,
        now: i64,
    ) -> Result<Option<UserShippingAddressRow>, sqlx::Error> {
        sqlx::query_as::<_, UserShippingAddressRow>(
            r#"UPDATE user_shipping_ciphertexts
               SET buyer_ciphertext = $3,
                   buyer_nonce = $4,
                   buyer_alg = $5,
                   encryption_key_version = $6,
                   updated_at = $7
               WHERE user_pubkey = $1 AND id = $2
               RETURNING id, user_pubkey, buyer_ciphertext, buyer_nonce, buyer_alg,
                         encryption_key_version,
                         is_default, created_at, updated_at"#,
        )
        .bind(user_pubkey)
        .bind(id)
        .bind(buyer_ciphertext)
        .bind(buyer_nonce)
        .bind(buyer_alg)
        .bind(encryption_key_version)
        .bind(now)
        .fetch_optional(&self.db_pool)
        .await
    }

    pub async fn delete_user_shipping_address(
        &self,
        user_pubkey: &str,
        id: i64,
    ) -> Result<u64, sqlx::Error> {
        let res = sqlx::query("DELETE FROM user_shipping_ciphertexts WHERE user_pubkey = $1 AND id = $2")
            .bind(user_pubkey)
            .bind(id)
            .execute(&self.db_pool)
            .await?;
        Ok(res.rows_affected())
    }

    pub async fn set_default_user_shipping_address(
        &self,
        user_pubkey: &str,
        id: i64,
        now: i64,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.db_pool.begin().await?;
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(
                SELECT 1
                FROM user_shipping_ciphertexts
                WHERE user_pubkey = $1 AND id = $2
            )",
        )
        .bind(user_pubkey)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or(false);
        if !exists {
            tx.rollback().await?;
            return Ok(false);
        }
        sqlx::query(
            "UPDATE user_shipping_ciphertexts
             SET is_default = FALSE, updated_at = $2
             WHERE user_pubkey = $1 AND is_default = TRUE",
        )
        .bind(user_pubkey)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE user_shipping_ciphertexts
             SET is_default = TRUE, updated_at = $3
             WHERE user_pubkey = $1 AND id = $2",
        )
        .bind(user_pubkey)
        .bind(id)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }
}
