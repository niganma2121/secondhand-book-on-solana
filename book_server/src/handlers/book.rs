use crate::db::types::{BookFilter, BookSortBy, Page};
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct MarketQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub keyword: Option<String>,
    pub category: Option<String>,
    pub condition: Option<String>,
    pub min_price: Option<i64>,
    pub max_price: Option<i64>,
    pub sort_by: Option<String>,
}

// GET /api/books?page=1&category=小说&keyword=xxx
pub async fn list_market_books_handler(
    State(state): State<AppState>,
    Query(q): Query<MarketQuery>,
) -> impl IntoResponse {
    let page = Page::new(q.page.unwrap_or(1), q.page_size.unwrap_or(20));
    let filter = BookFilter {
        keyword: q.keyword,
        category: q.category,
        condition: q.condition,
        min_price: q.min_price,
        max_price: q.max_price,
        sort_by: match q.sort_by.as_deref() {
            Some("price_asc") => BookSortBy::PriceAsc,
            Some("price_desc") => BookSortBy::PriceDesc,
            _ => BookSortBy::Newest,
        },
    };
    match state.db_service.list_market_books(&filter, &page).await {
        Ok(books) => (StatusCode::OK, Json(json!({ "books": books }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/books/:asset
pub async fn get_book_detail_handler(
    State(state): State<AppState>,
    Path(asset): Path<String>,
) -> impl IntoResponse {
    let detail = state.db_service.get_book_detail(&asset).await;
    let images = state.db_service.get_book_images(&asset).await;

    match (detail, images) {
        (Ok(Some(book)), Ok(imgs)) => (
            StatusCode::OK,
            Json(json!({
                "book":   book,
                "images": imgs,
            })),
        )
            .into_response(),
        (Ok(None), _) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "书籍不存在" })),
        )
            .into_response(),
        (Err(e), _) | (_, Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
