use crate::auth::error::AuthError;
use crate::auth::types::LoginRequest;
use crate::auth::util::{generate_stateless_nonce, store_nonce};
use crate::state::AppState;
use anyhow::Result;
use axum::Json;
use axum::extract::{Query, State};
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
    let cookie = Cookie::build(("jwt-token", token))
        .path("/")
        .http_only(true)
        .secure(false) //本地为false,HTTPs为true
        .same_site(SameSite::Lax) 
        .max_age(time::Duration::hours(48))
        .build();

    Ok((jar.add(cookie), Json(json!({"status":"success"}))))
}

//登出处理
pub async fn logout_handler(
    State(state):State<AppState>,
    jar:CookieJar
)->Result<impl IntoResponse,AuthError>{
    info!("收到登出请求");
    if let Some(token_cookie)=jar.get("jwt-token"){
        state.auth_service.sign_out(token_cookie.value()).await
            .map_err(|e|AuthError::Internal(e.to_string()))?;
        info!("登出成功，已写入黑名单");
    }else {
        warn!("登出请求没有携带 jwt-token cookie");
    }
    let removed=jar.remove(Cookie::build("jwt-token").path("/").build());
    Ok((removed,Json(json!({"status":"logged out"}))))
}