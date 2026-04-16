//公共请求,无需登陆即可访问

use std::sync::Arc;
use axum::middleware::from_fn_with_state;
use axum::Router;
use axum::routing::{get, post};
use crate::auth::{auth_middleware, get_nonce_handler, login_handler};
use crate::handlers::get_me;
use crate::state::AppState;

pub async fn page_home() ->&'static str{
    "欢迎来到主页"
}

pub fn auth_router(state:Arc<AppState>)->Router<Arc<AppState>>{
    Router::new()
        .route("/me", get(get_me).layer(from_fn_with_state(state.clone(), auth_middleware)))
        .route("/nonce",get(get_nonce_handler))
        .route("/login",post(login_handler))
}

pub fn api_public_router(state:Arc<AppState>)->Router<Arc<AppState>>{
    Router::new()
        .nest("/auth",auth_router(state))
}