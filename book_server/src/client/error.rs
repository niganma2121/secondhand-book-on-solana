use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Response};
use thiserror::Error;
#[derive(Error, Debug)]
pub enum ClientError {
    #[error("程序句柄获取失败{0}")]
    ProgramError(#[from] anchor_client::ClientError),

    #[error("无效的地址:{0}")]
    InvalidAddress(String),

    #[error("交易(反)序列化失败:{0}")]
    TxBuildError(String),

    #[error("签名的交易校验失败{0}")]
    TxVerifyFailed(String),

    #[error("获取哈希区块使用:{0}")]
    BlockError(String),

    #[error("无效的投票选项请选择合理的投票")]
    BadChoice,

    #[error("广播失败:{0}")]
    BroadcastFailed(String),

    #[error("Ipfs出问题{0}")]
    IpfsError(String),

    #[error("数据库操作失败:{0}")]
    DbError(String),

    #[error("图片类型校验失败:{0}")]
    InvalidImageType(String),

    #[error("请求过于频繁，请稍后再试")]
    RateLimited,
}
impl IntoResponse for ClientError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            ClientError::InvalidAddress(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ClientError::BadChoice => (StatusCode::BAD_REQUEST, self.to_string()),
            ClientError::TxBuildError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ClientError::TxVerifyFailed(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ClientError::BlockError(_) => (StatusCode::SERVICE_UNAVAILABLE, self.to_string()),
            ClientError::BroadcastFailed(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            ClientError::IpfsError(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            ClientError::ProgramError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ClientError::DbError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ClientError::InvalidImageType(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ClientError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, self.to_string()),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}