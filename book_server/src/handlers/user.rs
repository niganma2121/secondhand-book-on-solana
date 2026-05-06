use crate::db::types::Page;
use crate::handlers::error::{HandlerResult, not_found, ok};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct PageQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

impl PageQuery {
    pub fn to_page(&self) -> Page {
        Page::new(self.page.unwrap_or(1), self.page_size.unwrap_or(20))
    }
}

// GET /api/users/:pubkey
pub async fn get_user_handler(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> HandlerResult {
    let user = state
        .db_service
        .get_user(&pubkey)
        .await?
        .ok_or_else(|| not_found("用户不存在"))?;
    Ok(ok(json!(user)))
}

// GET /api/users/:pubkey/books?page=1
pub async fn list_seller_books_handler(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let books = state.db_service.list_seller_books(&pubkey, &page).await?;
    Ok(ok(json!({ "books": books })))
}

// GET /api/users/:pubkey/reviews?page=1
pub async fn list_user_reviews_handler(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();

    // 同时查评价列表和信誉聚合
    let reviews = state.db_service.list_user_reviews(&pubkey, &page).await?;
    let reputation = state.db_service.get_reputation(&pubkey).await?;
    Ok(ok(json!({
        "reviews":    reviews,
        "reputation": reputation,
    })))
}

// GET /api/users/:pubkey/encryption-pubkey
pub async fn get_user_encryption_pubkey_handler(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> HandlerResult {
    let user = state
        .db_service
        .get_user(&pubkey)
        .await?
        .ok_or_else(|| not_found("用户不存在"))?;
    let enc_pubkey = user
        .enc_pubkey
        .ok_or_else(|| not_found("用户未配置通讯公钥"))?;
    Ok(ok(json!({ "pubkey": pubkey, "encryption_public_key": enc_pubkey })))
}
