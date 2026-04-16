
//必须登陆才能访问的请求

use std::sync::Arc;
use axum::middleware::from_fn_with_state;
use axum::Router;
use axum::routing::get;
use crate::auth::auth_middleware;
use crate::chat::chat_handler;
use crate::state::AppState;

///访问需要登陆的路由
pub fn api_protected_router(state:Arc<AppState>) ->Router<Arc<AppState>>{
    Router::new()
        .nest("/chat",ws_router())
        .layer(from_fn_with_state(state.clone(),auth_middleware))
}

pub fn ws_router()->Router<Arc<AppState>>{
    Router::new()
        .route("/ws",get(chat_handler))
}