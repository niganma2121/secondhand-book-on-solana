//必须登陆才能访问的请求
use crate::auth::auth_middleware;
use crate::chat::chat_handler;
use crate::client::{
    broadcast_cancel_escrow_handler, broadcast_confirm_receipt_handler,
    broadcast_create_book_handler, broadcast_create_escrow_handler, broadcast_delist_handler,
    broadcast_open_dispute_handler, broadcast_resolve_dispute_handler, broadcast_ship_handler,
    broadcast_update_price_handler, cancel_escrow_handler, confirm_receipt_handler,
    create_book_handler, create_escrow_handler, delist_book_handler, open_dispute_handler,
    resolve_dispute_handler, ship_book_handler, update_price_handler,
};
use crate::handlers::me::{
    list_bought_books_handler, list_buyer_escrows_handler, list_favorites_handler,
    list_seller_escrows_handler, toggle_favorite_handler,
};
use crate::state::AppState;
use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};

///访问需要登陆的路由
pub fn api_protected_router(state: AppState) -> Router<AppState> {
    Router::new()
        .nest("/chat", ws_router())
        .nest("/book", book_router())
        .nest("/escrow", escrow_router())
        .layer(from_fn_with_state(state.clone(), auth_middleware))
}

pub fn ws_router() -> Router<AppState> {
    Router::new().route("/ws", get(chat_handler))
}

pub fn book_router() -> Router<AppState> {
    Router::new()
        .route("/create", post(create_book_handler))
        .route("/create/broadcast", post(broadcast_create_book_handler))
        .route("/delist", post(delist_book_handler))
        .route("/delist/broadcast", post(broadcast_delist_handler))
        .route("/update-price", post(update_price_handler))
        .route(
            "/update-price/broadcast",
            post(broadcast_update_price_handler),
        )
}

pub fn escrow_router() -> Router<AppState> {
    Router::new()
        .route("/create", post(create_escrow_handler))
        .route("/create/broadcast", post(broadcast_create_escrow_handler))
        .route("/ship", post(ship_book_handler))
        .route("/ship/broadcast", post(broadcast_ship_handler))
        .route("/confirm", post(confirm_receipt_handler))
        .route(
            "/confirm/broadcast",
            post(broadcast_confirm_receipt_handler),
        )
        .route("/cancel", post(cancel_escrow_handler))
        .route("/cancel/broadcast", post(broadcast_cancel_escrow_handler))
        .route("/dispute", post(open_dispute_handler))
        .route("/dispute/broadcast", post(broadcast_open_dispute_handler))
        .route("/resolve", post(resolve_dispute_handler))
        .route(
            "/resolve/broadcast",
            post(broadcast_resolve_dispute_handler),
        )
}

pub fn me_router() -> Router<AppState> {
    Router::new()
        .route("/favorites", get(list_favorites_handler))
        .route("/favorites/:asset", post(toggle_favorite_handler))
        .route("/orders/buying", get(list_buyer_escrows_handler))
        .route("/orders/selling", get(list_seller_escrows_handler))
        .route("/bought", get(list_bought_books_handler))
}
