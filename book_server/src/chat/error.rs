use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Response};
use thiserror::Error;

#[derive(Error,Debug)]
pub enum ChatError{
    #[error("ID产生错误:{0}")]
    IdGeneratorError(String),

    #[error("消息序列化失败:{0}")]
    SerializeError(#[from] serde_json::Error),

    #[error("数据库操作失败:{0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("服务器错误:{0}")]
    InternalError(String),

    #[error("系统时间错误:{0}")]
    SystemError(#[from] std::time::SystemTimeError),

    #[error("发送失败:{0}")]
    SendError(String),

    #[error("公钥解析失败:{0}")]
    PubkeyParseError(String)
}

impl IntoResponse for ChatError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            ChatError::PubkeyParseError(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}
