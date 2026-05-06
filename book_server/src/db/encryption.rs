use crate::db::DBService;
use crate::db::types::{EncryptionTemplateRow, UserEncryptionBackupRow};
use serde_json::Value;

impl DBService {
    pub async fn upsert_encryption_template(
        &self,
        version: &str,
        message_template: &str,
        kdf_name: &str,
        kdf_params: &Value,
        is_active: bool,
        now: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO encryption_templates
               (version, message_template, kdf_name, kdf_params, is_active, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $6)
               ON CONFLICT (version) DO UPDATE
               SET message_template = EXCLUDED.message_template,
                   kdf_name = EXCLUDED.kdf_name,
                   kdf_params = EXCLUDED.kdf_params,
                   is_active = EXCLUDED.is_active,
                   updated_at = EXCLUDED.updated_at"#,
        )
        .bind(version)
        .bind(message_template)
        .bind(kdf_name)
        .bind(kdf_params)
        .bind(is_active)
        .bind(now)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    pub async fn list_active_encryption_templates(&self) -> Result<Vec<EncryptionTemplateRow>, sqlx::Error> {
        sqlx::query_as::<_, EncryptionTemplateRow>(
            "SELECT version, message_template, kdf_name, kdf_params, is_active, created_at, updated_at
             FROM encryption_templates
             WHERE is_active = true
             ORDER BY version ASC",
        )
        .fetch_all(&self.db_pool)
        .await
    }

    pub async fn get_encryption_template(
        &self,
        version: &str,
    ) -> Result<Option<EncryptionTemplateRow>, sqlx::Error> {
        sqlx::query_as::<_, EncryptionTemplateRow>(
            "SELECT version, message_template, kdf_name, kdf_params, is_active, created_at, updated_at
             FROM encryption_templates
             WHERE version = $1",
        )
        .bind(version)
        .fetch_optional(&self.db_pool)
        .await
    }

    pub async fn upsert_user_encryption_backup(
        &self,
        pubkey: &str,
        backup_version: &str,
        encrypted_private_key: &str,
        nonce: &str,
        kdf_salt: &str,
        kdf_params: &Value,
        now: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO user_encryption_backups
               (pubkey, backup_version, encrypted_private_key, nonce, kdf_salt, kdf_params, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
               ON CONFLICT (pubkey) DO UPDATE
               SET backup_version = EXCLUDED.backup_version,
                   encrypted_private_key = EXCLUDED.encrypted_private_key,
                   nonce = EXCLUDED.nonce,
                   kdf_salt = EXCLUDED.kdf_salt,
                   kdf_params = EXCLUDED.kdf_params,
                   updated_at = EXCLUDED.updated_at"#,
        )
        .bind(pubkey)
        .bind(backup_version)
        .bind(encrypted_private_key)
        .bind(nonce)
        .bind(kdf_salt)
        .bind(kdf_params)
        .bind(now)
        .execute(&self.db_pool)
        .await?;
        Ok(())
    }

    pub async fn get_user_encryption_backup(
        &self,
        pubkey: &str,
    ) -> Result<Option<UserEncryptionBackupRow>, sqlx::Error> {
        sqlx::query_as::<_, UserEncryptionBackupRow>(
            "SELECT pubkey, backup_version, encrypted_private_key, nonce, kdf_salt, kdf_params, created_at, updated_at
             FROM user_encryption_backups
             WHERE pubkey = $1",
        )
        .bind(pubkey)
        .fetch_optional(&self.db_pool)
        .await
    }
}
