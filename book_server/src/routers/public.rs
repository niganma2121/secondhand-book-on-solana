//公共请求,无需登陆即可访问
use axum::middleware::from_fn_with_state;
use axum::{Extension, Json, Router};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use serde_json::json;
use crate::auth::{auth_middleware, get_nonce_handler, login_handler, logout_handler};
use crate::handlers::book::{get_book_detail_handler, list_market_books_handler};
use crate::handlers::user::{get_user_handler, list_seller_books_handler, list_user_reviews_handler};
use crate::state::AppState;
pub async fn get_me(
    Extension(address): Extension<String>,
) -> impl IntoResponse {
    Json(json!({ "address": address, "status": "ok" }))
}
pub fn auth_router(state:AppState)->Router<AppState>{
    Router::new()
        .route("/getme", get(get_me).layer(from_fn_with_state(state.clone(), auth_middleware)))
        .route("/nonce",get(get_nonce_handler))
        .route("/login",post(login_handler))
        .route("/logout",get(logout_handler))
}

pub fn api_public_router(state: AppState) -> Router<AppState> {
    Router::new()
        .nest("/auth",  auth_router(state))
        .nest("/books", books_public_router())
        .nest("/users", users_public_router())
}

pub fn books_public_router() -> Router<AppState> {
    Router::new()
        .route("/",       get(list_market_books_handler))
        .route("/:asset", get(get_book_detail_handler))
}

pub fn users_public_router() -> Router<AppState> {
    Router::new()
        .route("/:pubkey",         get(get_user_handler))
        .route("/:pubkey/books",   get(list_seller_books_handler))
        .route("/:pubkey/reviews", get(list_user_reviews_handler))
}

