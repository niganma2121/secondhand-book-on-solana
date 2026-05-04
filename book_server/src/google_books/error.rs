use thiserror::Error;

#[derive(Debug, Error)]
pub enum GoogleBooksError {
    #[error("未配置 GOOGLE_BOOKS_API_KEY")]
    MissingApiKey,
    #[error("Google Books 请求失败: {0}")]
    Upstream(String),
    #[error("解析响应失败: {0}")]
    Parse(String),
}
