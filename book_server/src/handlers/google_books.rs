use crate::google_books::{self, GoogleBooksHit};
use crate::GOOGLE_BOOKS_API_KEY;
use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use dotenvy::var;
use serde::Deserialize;
use serde_json::json;
use tracing::warn;

#[derive(Deserialize)]
pub struct GoogleBooksSearchQuery {
    pub q: String,
    pub limit: Option<u32>,
}

/// GET /api/google-books/search?q=数学分析&limit=12  
/// 需在服务端环境变量配置 `GOOGLE_BOOKS_API_KEY`（Google Cloud Console → Books API）
pub async fn google_books_search_handler(Query(q): Query<GoogleBooksSearchQuery>) -> impl IntoResponse {
    let query = q.q.trim();
    if query.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "缺少搜索关键词 q" })),
        )
            .into_response();
    }

    let api_key = match var(GOOGLE_BOOKS_API_KEY) {
        Ok(k) if !k.trim().is_empty() => k,
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "服务器未配置 GOOGLE_BOOKS_API_KEY，请在 book_server 环境变量中填写 Google Books API 密钥"
                })),
            )
                .into_response();
        }
    };

    let limit = q.limit.unwrap_or(12);
    match google_books::search_volumes(&api_key, query, limit).await {
        Ok(hits) => {
            let body: Vec<GoogleBooksHit> = hits;
            (StatusCode::OK, Json(json!({ "results": body }))).into_response()
        }
        Err(e) => {
            warn!(target: "google_books", "Google Books 代理失败: {e}");
            let status = if matches!(e, google_books::GoogleBooksError::MissingApiKey) {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::BAD_GATEWAY
            };
            (status, Json(json!({ "error": e.to_string() }))).into_response()
        }
    }
}
