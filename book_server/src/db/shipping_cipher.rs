use crate::db::DBService;
use crate::db::types::EscrowShippingCipherRow;

impl DBService {
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_escrow_shipping_cipher(
        &self,
        escrow_pda: &str,
        buyer_pubkey: &str,
        seller_pubkey: &str,
        seller_ciphertext: &str,
        seller_nonce: &str,
        seller_alg: &str,
        buyer_ciphertext: Option<&str>,
        buyer_nonce: Option<&str>,
        buyer_alg: Option<&str>,
        encryption_key_version: &str,
        now: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO escrow_shipping_ciphertexts
               (escrow_pda, buyer_pubkey, seller_pubkey, seller_ciphertext, seller_nonce, seller_alg,
                buyer_ciphertext, buyer_nonce, buyer_alg, encryption_key_version, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
               ON CONFLICT (escrow_pda) DO UPDATE
               SET buyer_pubkey = EXCLUDED.buyer_pubkey,
                   seller_pubkey = EXCLUDED.seller_pubkey,
                   seller_ciphertext = EXCLUDED.seller_ciphertext,
                   seller_nonce = EXCLUDED.seller_nonce,
                   seller_alg = EXCLUDED.seller_alg,
                   buyer_ciphertext = EXCLUDED.buyer_ciphertext,
                   buyer_nonce = EXCLUDED.buyer_nonce,
                   buyer_alg = EXCLUDED.buyer_alg,
                   encryption_key_version = EXCLUDED.encryption_key_version,
                   updated_at = EXCLUDED.updated_at"#,
        )
        .bind(escrow_pda)
        .bind(buyer_pubkey)
        .bind(seller_pubkey)
        .bind(seller_ciphertext)
        .bind(seller_nonce)
        .bind(seller_alg)
        .bind(buyer_ciphertext)
        .bind(buyer_nonce)
        .bind(buyer_alg)
        .bind(encryption_key_version)
        .bind(now)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    pub async fn get_escrow_shipping_cipher(
        &self,
        escrow_pda: &str,
    ) -> Result<Option<EscrowShippingCipherRow>, sqlx::Error> {
        sqlx::query_as::<_, EscrowShippingCipherRow>(
            r#"SELECT escrow_pda, buyer_pubkey, seller_pubkey,
                      seller_ciphertext, seller_nonce, seller_alg,
                      buyer_ciphertext, buyer_nonce, buyer_alg,
                      encryption_key_version, created_at, updated_at
               FROM escrow_shipping_ciphertexts
               WHERE escrow_pda = $1"#,
        )
        .bind(escrow_pda)
        .fetch_optional(&self.db_pool)
        .await
    }
}
