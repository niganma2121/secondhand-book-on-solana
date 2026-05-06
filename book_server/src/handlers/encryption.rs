use crate::state::AppState;
use crate::handlers::error::{HandlerResult, bad_request, not_found, ok};
use axum::extract::State;
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
pub struct UpsertMyEncryptionBackupRequest {
    pub backup_version: String,
    pub encryption_public_key: String,
    pub encrypted_private_key: String,
    pub nonce: String,
    pub kdf_salt: String,
    pub kdf_params: Value,
}

// 公共：列出可用模板版本
pub async fn list_encryption_templates_handler(State(state): State<AppState>) -> HandlerResult {
    let rows = state.db_service.list_active_encryption_templates().await?;
    let list: Vec<_> = rows
        .into_iter()
        .map(|r| {
            json!({
                "version": r.version,
                "message_template": r.message_template,
                "kdf_name": r.kdf_name,
                "kdf_params": r.kdf_params,
            })
        })
        .collect();
    Ok(ok(json!({ "templates": list })))
}

// 登录态：写入/更新当前用户密钥备份密文
pub async fn upsert_my_encryption_backup_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<UpsertMyEncryptionBackupRequest>,
) -> HandlerResult {
    let template = state
        .db_service
        .get_encryption_template(&req.backup_version)
        .await?;
    if template.is_none() {
        return Err(bad_request("未知的 backup_version"));
    }

    let now = chrono::Utc::now().timestamp();
    state
        .db_service
        .upsert_user_encryption_backup(
            &pubkey,
            &req.backup_version,
            &req.encrypted_private_key,
            &req.nonce,
            &req.kdf_salt,
            &req.kdf_params,
            now,
        )
        .await?;
    state
        .db_service
        .upsert_user_encryption_pubkey(&pubkey, &req.encryption_public_key)
        .await?;
    Ok(ok(json!({ "msg": "备份已更新" })))
}

// 登录态：读取当前用户密钥备份密文
pub async fn get_my_encryption_backup_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
) -> HandlerResult {
    let row = state
        .db_service
        .get_user_encryption_backup(&pubkey)
        .await?
        .ok_or_else(|| not_found("未找到密钥备份"))?;
    Ok(ok(json!({
        "pubkey": row.pubkey,
        "backup_version": row.backup_version,
        "encrypted_private_key": row.encrypted_private_key,
        "nonce": row.nonce,
        "kdf_salt": row.kdf_salt,
        "kdf_params": row.kdf_params,
        "updated_at": row.updated_at
    })))
}
