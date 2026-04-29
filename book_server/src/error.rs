use axum::response::{IntoResponse, Response};
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
        todo!()
    }
}