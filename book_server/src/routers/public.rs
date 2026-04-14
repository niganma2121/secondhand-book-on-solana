//公共请求,无需登陆即可访问

use std::sync::Arc;
use axum::Router;
use axum::routing::get;
use crate::handlers::auth::{get_nonce_handler, login_handler};
use crate::handlers::ws_handler::{chat_handler};
use crate::state::AppState;

pub async fn page_home() ->&'static str{
    "欢迎来到主页"
}


pub fn auth_router()->Router<Arc<AppState>>{
    Router::new()
        .route("/nonce",get(get_nonce_handler))
        .route("/login",get(login_handler))
}

pub fn api_public_router()->Router<Arc<AppState>>{
    Router::new()
        .nest("/",auth_router())
}