use axum::response::{Json,IntoResponse, Response};
use serde_json::json;
use thiserror::Error;
use axum::http::StatusCode;

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
    SendError(String)
}


#[derive(Error,Debug)]
pub enum UtilsError{
    #[error("密钥长度非法")]
    InvalidSecretLength,

    #[error("Nonce已经过期")]
    NonceExpired,

    #[error("无效的Nonce格式")]
    InvalidNonceFormat,

    #[error("无效的地址")]
    InvalidAddress,

    #[error("无效的签名")]
    InvalidSignature,

    #[error("公钥转换失败")]
    PubkeyError,
    #[error("时间溢出")]
    TimeError,

    #[error("JWT生成失败{0}")]
    JWTCrateFailed(String),
    
    #[error("JWT验证错误{0}")]
    JwtVerifyFailed(String)
}

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("服务器内部错误: {0}")]
    Internal(String),
    #[error("认证错误: {0}")]
    Unauthorized(String),
    #[error("无效请求: {0}")]
    BadRequest(String),
}

impl IntoResponse for AuthError{
    fn into_response(self) -> Response {
        let (status,err_msg)=match self{
            AuthError::Internal(ref s) =>(StatusCode::INTERNAL_SERVER_ERROR,s),
            AuthError::Unauthorized(ref s) =>(StatusCode::UNAUTHORIZED,s),
            AuthError::BadRequest(ref s) =>(StatusCode::BAD_REQUEST,s)
        };
        let body=Json(json!({
            "error":err_msg
        }));

        (status,body).into_response()
    }
}
