use axum::response::{IntoResponse, Response};
use axum::{Json, http::StatusCode};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("数据库错误:{0}")]
    DbError(#[from] sqlx::Error),

    #[error("id生成失败:{0}")]
    IdGeneratorError(String),

    #[error("未找到:{0}")]
    NotFound(String),

    #[error("无权限")]
    Unauthorized,

    #[error("参数错误:{0}")]
    BadRequest(String),
}

impl IntoResponse for AppError{
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            AppError::DbError(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("数据库错误:{e}")),
            AppError::IdGeneratorError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, format!("id生成失败:{msg}")),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, format!("未找到:{msg}")),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "无权限".to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, format!("参数错误:{msg}")),
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}