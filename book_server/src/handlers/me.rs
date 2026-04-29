use crate::AppError;
use crate::db::types::Page;
use crate::state::AppState;
use axum::Extension;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::Utc;
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

// GET /api/me/favorites
pub async fn list_favorites_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let page = q.to_page();
    let books = state.db_service.list_user_favorites(&pubkey, &page).await?;
    Ok((StatusCode::OK, Json(json!({ "books": books }))))
}

// POST /api/me/favorites/:asset  → 已收藏则取消，未收藏则添加
pub async fn toggle_favorite_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(asset): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let now = Utc::now().timestamp();
    if state.db_service.is_favorited(&pubkey, &asset).await? {
        state.db_service.remove_favorite(&pubkey, &asset).await?;
        Ok((StatusCode::OK, Json(json!({ "favorited": false }))))
    } else {
        state.db_service.add_favorite(&pubkey, &asset, now).await?;
        Ok((StatusCode::OK, Json(json!({ "favorited": true }))))
    }
}
// GET /api/me/orders/buying
pub async fn list_buyer_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let page = q.to_page();
    let orders = state.db_service.list_buyer_escrows(&pubkey, &page).await?;
    Ok((StatusCode::OK, Json(json!({ "orders": orders }))))
}

// GET /api/me/orders/selling
pub async fn list_seller_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let page = q.to_page();
    let orders = state.db_service.list_seller_escrows(&pubkey, &page).await?;
    Ok((StatusCode::OK, Json(json!({ "orders": orders }))))
}

// GET /api/me/bought
pub async fn list_bought_books_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let page = q.to_page();
    let books = state.db_service.list_bought_books(&pubkey, &page).await?;
    Ok((StatusCode::OK, Json(json!({ "books": books }))))
}
// POST /api/me/reviews
#[derive(Deserialize)]
pub struct SubmitReviewRequest {
    pub escrow_pda: String,
    pub reviewee: String,
    pub score: i16,
    pub comment: Option<String>,
}

pub async fn submit_review_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<SubmitReviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    let now = Utc::now().timestamp();
    let id = state
        .id_generator
        .next_id()
        .map_err(|e| AppError::IdGeneratorError(e.to_string()))?;

    state
        .db_service
        .insert_review(
            id as i64,
            &req.escrow_pda,
            &pubkey,
            &req.reviewee,
            req.score,
            req.comment.as_deref(),
            now,
        )
        .await?;

    Ok((StatusCode::OK, Json(json!({ "msg": "评价提交成功" }))))
}
