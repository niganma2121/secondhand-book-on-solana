use crate::auth::error::AuthError;
use crate::auth::types::LoginRequest;
use crate::auth::util::{generate_stateless_nonce, store_nonce};
use crate::state::AppState;
use crate::COOKIE_SECURE_ENV;
use anyhow::Result;
use axum::Json;
use dotenvy::var;
use axum::extract::{Query, State};
use axum::http::header::AUTHORIZATION;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use serde_json::json;
use std::collections::HashMap;
use tracing::info;
use tracing::log::warn;

//处理获取nonce请求
pub async fn get_nonce_handler(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AuthError> {
    let address = params
        .get("pubkey")
        .ok_or_else(|| AuthError::BadRequest("缺少地址".into()))?;

    bs58::decode(address)
        .into_vec()
        .map_err(|_| AuthError::BadRequest("无效的 Solana 地址格式".into()))?;
    let nonce = generate_stateless_nonce(address, &state.auth_service.nonce_secret)
        .map_err(|e| AuthError::Internal(e.to_string()))?;
    store_nonce(&state.auth_service.redis_pool, address, &nonce).await?;

    Ok(Json(json!({"nonce":nonce})))
}

//登录处理
pub async fn login_handler(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AuthError> {
    let token = state.auth_service.sign_in(payload).await
        .map_err(|e| AuthError::Unauthorized(e.to_string()))?;
    let cookie_secure = var(COOKIE_SECURE_ENV)
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let cookie = Cookie::build(("jwt-token", token.clone()))
        .path("/")
        .http_only(true)
        .secure(cookie_secure)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::hours(48))
        .build();

    Ok((
        jar.add(cookie),
        Json(json!({"status":"success","token": token})),
    ))
}

//登出处理（Cookie 或 `Authorization: Bearer`）
pub async fn logout_handler(
    State(state):State<AppState>,
    jar:CookieJar,
    headers:HeaderMap
)->Result<impl IntoResponse,AuthError>{
    info!("收到登出请求");
    let token_opt = jar
        .get("jwt-token")
        .map(|c| c.value().to_string())
        .or_else(|| {
            headers
                .get(AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
                .map(str::trim)
                .map(String::from)
        });

    if let Some(ref t) = token_opt {
        state.auth_service.sign_out(t).await
            .map_err(|e|AuthError::Internal(e.to_string()))?;
        info!("登出成功，已写入黑名单");
    } else {
        warn!("登出请求未携带 jwt（Cookie 或 Bearer）");
    }
    let removed=jar.remove(Cookie::build("jwt-token").path("/").build());
    Ok((removed,Json(json!({"status":"logged out"}))))
}