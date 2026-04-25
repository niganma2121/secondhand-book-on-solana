use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Response};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum QueryError {
    #[error("数据库错误: {0}")]
    DbError(#[from] sqlx::Error),

    #[error("未找到: {0}")]
    NotFound(String),
}

impl IntoResponse for QueryError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            QueryError::NotFound(m)  => (StatusCode::NOT_FOUND, m.clone()),
            QueryError::DbError(e)   => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}
