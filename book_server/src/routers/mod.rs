//该模块专门处理路由

use axum::Router;
use axum::routing::get;
use crate::handlers::ws_handler::{chat_handler, handle_socket};
use crate::state::AppState;

pub async fn page_home() ->&'static str{
    "欢迎来到主页"
}


pub fn ws_router()->Router<AppState>{
    Router::new()
        .route("/ws",get(chat_handler))
}