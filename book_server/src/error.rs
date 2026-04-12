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
    SystemError(#[from] std::time::SystemTimeError)
}