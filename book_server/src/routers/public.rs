//公共请求,无需登陆即可访问
use axum::middleware::from_fn_with_state;
use axum::{Router};
use axum::routing::{get, post};
use crate::auth::{auth_middleware, get_nonce_handler, login_handler, logout_handler};
use crate::get_me;
use crate::handlers::book::{
    get_book_detail_handler, list_book_categories_handler, list_book_conditions_handler,
    list_market_books_handler,
};
use crate::google_books::google_books_search_handler;
use crate::handlers::user::{get_user_handler, list_seller_books_handler, list_user_reviews_handler};
use crate::state::AppState;

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
        .nest("/google-books", google_books_public_router())
}

fn google_books_public_router() -> Router<AppState> {
    Router::new().route("/search", get(google_books_search_handler))
}

pub fn books_public_router() -> Router<AppState> {
    Router::new()
        .route("/categories", get(list_book_categories_handler))
        .route("/conditions", get(list_book_conditions_handler))
        .route("/", get(list_market_books_handler))
        .route("/{asset}", get(get_book_detail_handler))
}

pub fn users_public_router() -> Router<AppState> {
    Router::new()
        .route("/{pubkey}",         get(get_user_handler))
        .route("/{pubkey}/books",   get(list_seller_books_handler))
        .route("/{pubkey}/reviews", get(list_user_reviews_handler))
}

