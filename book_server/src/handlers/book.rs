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

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

fn mask_pubkey(pk: &str) -> String {
    if pk.chars().count() <= 10 {
        return pk.to_string();
    }
    let head: String = pk.chars().take(4).collect();
    let tail: String = pk
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{head}...{tail}")
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

// GET /api/books/:asset/history?page=1&page_size=20
pub async fn get_book_history_handler(
    State(state): State<AppState>,
    Path(asset): Path<String>,
    Query(q): Query<HistoryQuery>,
) -> HandlerResult {
    let page = Page::new(q.page.unwrap_or(1), q.page_size.unwrap_or(20));
    let book_events = state.db_service.list_book_events(&asset, &page).await?;
    let escrow_events = state.db_service.list_escrow_events_by_asset(&asset, &page).await?;

    let book_events_json: Vec<_> = book_events
        .into_iter()
        .map(|e| {
            json!({
                "id": e.id,
                "asset": e.asset,
                "event_type": e.event_type,
                "from_owner": e.from_owner.as_deref().map(mask_pubkey),
                "to_owner": e.to_owner.as_deref().map(mask_pubkey),
                "escrow_pda": e.escrow_pda,
                "tx_signature": e.tx_signature,
                "actor_pubkey": e.actor_pubkey.as_deref().map(mask_pubkey),
                "payload": e.payload,
                "created_at": e.created_at
            })
        })
        .collect();

    let escrow_events_json: Vec<_> = escrow_events
        .into_iter()
        .map(|e| {
            json!({
                "id": e.id,
                "escrow_pda": e.escrow_pda,
                "asset": e.asset,
                "seller": mask_pubkey(&e.seller),
                "buyer": mask_pubkey(&e.buyer),
                "from_state": e.from_state,
                "to_state": e.to_state,
                "action": e.action,
                "tx_signature": e.tx_signature,
                "actor_pubkey": e.actor_pubkey.as_deref().map(mask_pubkey),
                "created_at": e.created_at
            })
        })
        .collect();

    Ok(ok(json!({
        "asset": asset,
        "book_events": book_events_json,
        "escrow_events": escrow_events_json
    })))
}
