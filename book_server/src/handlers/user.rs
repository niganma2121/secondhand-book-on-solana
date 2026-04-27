use crate::db::types::Page;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
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
) -> impl IntoResponse {
    match state.db_service.get_user(&pubkey).await {
        Ok(Some(user)) => (StatusCode::OK, Json(json!(user))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "用户不存在" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/users/:pubkey/books?page=1
pub async fn list_seller_books_handler(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
    Query(q): Query<PageQuery>,
) -> impl IntoResponse {
    let page = q.to_page();
    match state.db_service.list_seller_books(&pubkey, &page).await {
        Ok(books) => (StatusCode::OK, Json(json!({ "books": books }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/users/:pubkey/reviews?page=1
pub async fn list_user_reviews_handler(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
    Query(q): Query<PageQuery>,
) -> impl IntoResponse {
    let page = q.to_page();

    // 同时查评价列表和信誉聚合
    let reviews = state.db_service.list_user_reviews(&pubkey, &page).await;
    let reputation = state.db_service.get_reputation(&pubkey).await;

    match (reviews, reputation) {
        (Ok(reviews), Ok(reputation)) => (
            StatusCode::OK,
            Json(json!({
                "reviews":    reviews,
                "reputation": reputation,
            })),
        )
            .into_response(),
        (Err(e), _) | (_, Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
