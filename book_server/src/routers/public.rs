//公共请求,无需登陆即可访问

use std::sync::Arc;
use axum::middleware::from_fn_with_state;
use axum::{Extension, Json, Router};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use serde_json::json;
use crate::auth::{auth_middleware, get_nonce_handler, login_handler, logout_handler};
use crate::state::AppState;
pub async fn get_me(
    Extension(address): Extension<String>,
) -> impl IntoResponse {
    Json(json!({ "address": address, "status": "ok" }))
}
pub fn auth_router(state:AppState)->Router<AppState>{
    Router::new()
        .route("/me", get(get_me).layer(from_fn_with_state(state.clone(), auth_middleware)))
        .route("/nonce",get(get_nonce_handler))
        .route("/login",post(login_handler))
        .route("/logout",get(logout_handler))
}

pub fn api_public_router(state:AppState)->Router<AppState>{
    Router::new()
        .nest("/auth",auth_router(state))
}