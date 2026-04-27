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
) -> impl IntoResponse {
    let page = q.to_page();
    match state.db_service.list_user_favorites(&pubkey, &page).await {
        Ok(books) => (StatusCode::OK, Json(json!({ "books": books }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// POST /api/me/favorites/:asset  → 已收藏则取消，未收藏则添加
pub async fn toggle_favorite_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(asset): Path<String>,
) -> impl IntoResponse {
    // 先查是否已收藏
    let is_fav = state.db_service.is_favorited(&pubkey, &asset).await;
    match is_fav {
        Ok(true) => {
            // 已收藏，取消
            match state.db_service.remove_favorite(&pubkey, &asset).await {
                Ok(_) => (StatusCode::OK, Json(json!({ "favorited": false }))).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response(),
            }
        }
        Ok(false) => {
            // 未收藏，添加
            let now = Utc::now().timestamp();
            match state.db_service.add_favorite(&pubkey, &asset, now).await {
                Ok(_) => (StatusCode::OK, Json(json!({ "favorited": true }))).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/me/orders/buying
pub async fn list_buyer_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> impl IntoResponse {
    let page = q.to_page();
    match state.db_service.list_buyer_escrows(&pubkey, &page).await {
        Ok(orders) => (StatusCode::OK, Json(json!({ "orders": orders }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/me/orders/selling
pub async fn list_seller_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> impl IntoResponse {
    let page = q.to_page();
    match state.db_service.list_seller_escrows(&pubkey, &page).await {
        Ok(orders) => (StatusCode::OK, Json(json!({ "orders": orders }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/me/bought
pub async fn list_bought_books_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> impl IntoResponse {
    let page = q.to_page();
    match state.db_service.list_bought_books(&pubkey, &page).await {
        Ok(books) => (StatusCode::OK, Json(json!({ "books": books }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
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
) -> impl IntoResponse {
    let now = Utc::now().timestamp();
    // TODO: id 用 sonyflake 生成，暂时用时间戳占位
    let id = now;

    match state
        .db_service
        .insert_review(
            id,
            &req.escrow_pda,
            &pubkey,
            &req.reviewee,
            req.score,
            req.comment.as_deref(),
            now,
        )
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "msg": "评价提交成功" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
