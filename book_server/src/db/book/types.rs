use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct BookInfo {
    pub asset: String,
    pub book_pda: String,
    pub seller: String,
    pub collection: String,
    pub price: i64,
    pub status: String,
    pub metadata_url: String,
    pub metadata_hash:Vec<u8>,
    pub name: String,
    pub cover_url: Option<String>,
    pub author: Option<String>,
    pub series: Option<String>,
    pub category: String,
    pub condition: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 插入时用的参数
pub struct CreateBookParams<'a> {
    pub asset: &'a str,
    pub book_pda: &'a str,
    pub seller: &'a str,
    pub collection: &'a str,
    pub price: i64,
    pub metadata_url: &'a str,
    pub metadata_hash: &'a [u8], // 链上 [u8;32]
    pub name: &'a str,
    pub cover_url: Option<&'a str>,
    pub author: Option<&'a str>,
    pub series: Option<&'a str>,
    pub category: &'a str,
    pub condition: &'a str,
    pub created_at: i64,
}

/// 列表查询过滤条件
#[derive(Debug, Deserialize)]
pub struct BookFilter {
    pub category: Option<String>,
    pub condition: Option<String>,
    pub seller: Option<String>,
    pub min_price: Option<i64>,
    pub max_price: Option<i64>,
    /// 全文搜索关键词
    pub keyword: Option<String>,
    pub limit: i64,
    pub offset: i64,
}
