use thiserror::Error;

#[derive(Error,Debug)]
pub enum ClientError{
    #[error("程序句柄获取失败{0}")]
    ProgramError(#[from] anchor_client::ClientError),

    #[error("无效的地址:{0}")]
    InvalidAddress(String),

    #[error("交易(反)序列化失败:{0}")]
    TxBuildError(String),

    #[error("签名的交易校验失败{0}")]
    TxVerifyFailed(String),

    #[error("获取哈希区块使用:{0}")]
    BlockError(String)
}