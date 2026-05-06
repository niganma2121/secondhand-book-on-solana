use crate::db::types::{BookFilter, BookSortBy, Page};
use crate::handlers::error::{HandlerResult, not_found, ok};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
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
pub async fn list_book_categories_handler(State(state): State<AppState>) -> HandlerResult {
    let rows = state.db_service.list_book_categories().await?;
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
    Ok(ok(json!({ "categories": categories })))
}

// GET /api/books/conditions — 品相字典（存库用 key，展示用 label / description）
pub async fn list_book_conditions_handler(State(state): State<AppState>) -> HandlerResult {
    let rows = state.db_service.list_book_conditions().await?;
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
    Ok(ok(json!({ "conditions": conditions })))
}

// GET /api/books?page=1&category=literature&keyword=xxx （category 为 book_categories.key）
pub async fn list_market_books_handler(
    State(state): State<AppState>,
    Query(q): Query<MarketQuery>,
) -> HandlerResult {
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
    let books = state.db_service.list_market_books(&filter, &page).await?;
    Ok(ok(json!({ "books": books })))
}

// GET /api/books/:asset
pub async fn get_book_detail_handler(
    State(state): State<AppState>,
    Path(asset): Path<String>,
) -> HandlerResult {
    let book = state
        .db_service
        .get_book_detail(&asset)
        .await?
        .ok_or_else(|| not_found("书籍不存在"))?;
    let imgs = state.db_service.get_book_images(&asset).await?;
    Ok(ok(json!({
        "book":   book,
        "images": imgs,
    })))
}
