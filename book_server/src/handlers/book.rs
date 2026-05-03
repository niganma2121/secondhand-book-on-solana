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

// GET /api/books/categories — 上架与筛选用的分类字典（存库用 key，展示用 label）
pub async fn list_book_categories_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.db_service.list_book_categories().await {
        Ok(rows) => {
            let categories: Vec<_> = rows
                .iter()
                .map(|r| {
                    json!({
                        "key": r.key,
                        "label": r.label_zh,
                        "sort_order": r.sort_order
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "categories": categories }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/books/conditions — 品相字典（存库用 key，展示用 label / description）
pub async fn list_book_conditions_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.db_service.list_book_conditions().await {
        Ok(rows) => {
            let conditions: Vec<_> = rows
                .iter()
                .map(|r| {
                    json!({
                        "key": r.key,
                        "label": r.label_zh,
                        "description": r.description_zh,
                        "sort_order": r.sort_order
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "conditions": conditions }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/books?page=1&category=literature&keyword=xxx （category 为 book_categories.key）
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
