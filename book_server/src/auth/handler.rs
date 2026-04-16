use crate::auth::error::AuthError;
use crate::auth::sign_in;
use crate::auth::types::LoginRequest;
use crate::auth::util::generate_stateless_nonce;
use crate::state::AppState;
use anyhow::Result;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

//处理获取nonce请求
pub async fn get_nonce_handler(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AuthError> {
    let address = params
        .get("address")
        .ok_or_else(|| AuthError::BadRequest("缺少地址".into()))?;

    bs58::decode(address)
        .into_vec()
        .map_err(|_| AuthError::BadRequest("无效的 Solana 地址格式".into()))?;
    let nonce = generate_stateless_nonce(address, state.get_nonce_secret())
        .map_err(|e| AuthError::Internal(e.to_string()))?;
    Ok(Json(json!({"nonce":nonce})))
}

//处理请求验证颁发JWT
pub async fn login_handler(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AuthError> {
    let jwt_secret = state.get_jwt_secret();
    let nonce_secret = state.get_nonce_secret();
    let token = sign_in(payload, nonce_secret, jwt_secret)
        .map_err(|e| AuthError::Unauthorized(e.to_string()))?;
    let cookie = Cookie::build(("jwt-token", token))
        .path("/")
        .http_only(true)
        .secure(false) //本地为false,HTTPs为true
        .same_site(SameSite::Lax) // ✅ 本地跨端口调试建议用 Lax
        .max_age(time::Duration::hours(48))
        .build();

    Ok((jar.add(cookie), Json(json!({"status":"success"}))))
}
