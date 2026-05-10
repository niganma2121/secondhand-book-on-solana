//必须登陆才能访问的请求
use crate::auth::auth_middleware;
use crate::chat::chat_handler;
use crate::client::{
    broadcast_cancel_escrow_handler, broadcast_confirm_receipt_handler,
    broadcast_create_book_handler, broadcast_create_escrow_auto_handler,
    broadcast_delist_handler,
    broadcast_open_dispute_handler, broadcast_resolve_dispute_handler, broadcast_ship_handler,
    broadcast_update_price_handler, cancel_escrow_handler, confirm_receipt_handler,
    create_book_build_tx_handler, create_book_handler, create_book_metadata_handler,
    create_escrow_handler, delist_book_handler, init_collection_handler, open_dispute_handler,
    pinata_signed_upload_url_handler, resolve_dispute_handler, ship_book_handler,
    update_price_handler, upload_create_book_cover_handler, upload_create_book_detail_handler,
};
use crate::handlers::chat::{
    issue_ws_ticket_handler, list_chat_conversations_handler, list_chat_messages_handler,
    mark_chat_conversation_read_handler,
};
use crate::handlers::me::{
    create_my_shipping_address_handler, delete_my_shipping_address_handler,
    list_my_shipping_addresses_handler, set_default_my_shipping_address_handler,
    list_bought_books_handler, list_buyer_escrows_handler, list_favorites_handler,
    list_order_events_handler,
    list_my_books_handler, list_seller_escrows_handler, toggle_favorite_handler,
    get_order_shipping_cipher_handler, upsert_order_shipping_cipher_handler,
    update_my_shipping_address_handler, upsert_order_shipping_cipher_by_asset_handler,
    update_my_profile_handler,
};
use crate::handlers::transactions::list_my_transactions_handler;
use crate::handlers::encryption::{
    get_my_encryption_backup_handler, upsert_my_encryption_backup_handler,
};
use crate::me::submit_review_handler;
use crate::state::AppState;
use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{delete, get, patch, post};

///访问需要登陆的路由
pub fn api_protected_router(state: AppState) -> Router<AppState> {
    Router::new()
        .nest("/chat", chat_router())
        .nest("/book", book_router())
        .nest("/escrow", escrow_router())
        .nest("/me", me_router())
        .layer(from_fn_with_state(state.clone(), auth_middleware))
}

pub fn chat_router() -> Router<AppState> {
    Router::new()
        .route("/ws", get(chat_handler))
        .route("/ws-ticket", post(issue_ws_ticket_handler))
}

pub fn book_router() -> Router<AppState> {
    Router::new()
        .route("/collection/init", post(init_collection_handler))
        .route("/create/upload/signed-url", post(pinata_signed_upload_url_handler))
        .route("/create/upload/cover", post(upload_create_book_cover_handler))
        .route("/create/upload/detail", post(upload_create_book_detail_handler))
        .route("/create/metadata", post(create_book_metadata_handler))
        .route("/create/build-tx", post(create_book_build_tx_handler))
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
        .route("/create/broadcast", post(broadcast_create_escrow_auto_handler))
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
        .route("/transactions", get(list_my_transactions_handler))
        .route("/books", get(list_my_books_handler))
        .route("/favorites/", get(list_favorites_handler))
        .route("/favorites/{asset}", post(toggle_favorite_handler))
        .route("/orders/buying", get(list_buyer_escrows_handler))
        .route("/orders/selling", get(list_seller_escrows_handler))
        .route("/orders/{escrow_pda}/events", get(list_order_events_handler))
        .route("/profile", patch(update_my_profile_handler))
        .route("/orders/{escrow_pda}/shipping-cipher", get(get_order_shipping_cipher_handler))
        .route("/orders/{escrow_pda}/shipping-cipher", post(upsert_order_shipping_cipher_handler))
        .route("/orders/by-asset/{asset}/shipping-cipher", post(upsert_order_shipping_cipher_by_asset_handler))
        .route("/shipping-addresses", get(list_my_shipping_addresses_handler))
        .route("/shipping-addresses", post(create_my_shipping_address_handler))
        .route("/shipping-addresses/{id}", patch(update_my_shipping_address_handler))
        .route("/shipping-addresses/{id}", delete(delete_my_shipping_address_handler))
        .route("/shipping-addresses/{id}/default", post(set_default_my_shipping_address_handler))
        .route("/bought", get(list_bought_books_handler))
        .route("/reviews", post(submit_review_handler)) // 加这行
        .route("/chat/conversations", get(list_chat_conversations_handler))
        .route("/chat/{peer}/messages", get(list_chat_messages_handler))
        .route("/chat/{peer}/messages/read", post(mark_chat_conversation_read_handler))
        .route("/chat/{peer}/read", post(mark_chat_conversation_read_handler))
        .route("/encryption-backup", get(get_my_encryption_backup_handler))
        .route("/encryption-backup", post(upsert_my_encryption_backup_handler))
}
