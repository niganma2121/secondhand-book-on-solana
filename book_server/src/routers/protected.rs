//必须登陆才能访问的请求
use axum::middleware::from_fn_with_state;
use axum::Router;
use axum::routing::{get, post};
use crate::auth::auth_middleware;
use crate::chat::chat_handler;
use crate::client::{broadcast_handler, cancel_escrow_handler, confirm_receipt_handler, create_book_handler, create_escrow_handler, delist_book_handler, open_dispute_handler, resolve_dispute_handler, ship_book_handler, update_price_handler};
use crate::state::AppState;

///访问需要登陆的路由
pub fn api_protected_router(state:AppState) ->Router<AppState>{
    Router::new()
        .nest("/chat",ws_router())
        .nest("/book",book_router())
        .nest("/escrow",escrow_router())
        .nest("/tx",tx_router())
        .layer(from_fn_with_state(state.clone(),auth_middleware))
}

pub fn ws_router()->Router<AppState>{
    Router::new()
        .route("/ws",get(chat_handler))
}

pub fn book_router()->Router<AppState>{
    Router::new()
        .route("/create",post(create_book_handler))
        .route("/delist",post(delist_book_handler))
        .route("/update-price",post(update_price_handler))
}

pub fn escrow_router()->Router<AppState>{
    Router::new()
        .route("/create",post(create_escrow_handler))
        .route("/ship",post(ship_book_handler))
        .route("/confirm",post(confirm_receipt_handler))
        .route("/cancel",post(cancel_escrow_handler))
        .route("/dispute",post(open_dispute_handler))
        .route("/resolve",post(resolve_dispute_handler))
}

pub fn tx_router()->Router<AppState>{
    Router::new()
        .route("/broadcast",post(broadcast_handler))
}