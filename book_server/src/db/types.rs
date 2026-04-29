use serde::{Deserialize, Serialize};

//-------------------用户
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserRow {
    pub pubkey: String,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub trade_count: i32,
    pub sell_count: i32,
    pub buy_count: i32,
    pub created_at: i64,
}

//---------------------- 书籍
// 列表卡片（市场列表、卖家列表用，不含大字段）
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BookCardRow {
    pub asset: String,
    pub seller: String,
    pub price: i64,
    pub status: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub author: Option<String>,
    pub category: String,
    pub condition: String,
    pub created_at: i64,
}

// 书籍完整详情
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BookDetailRow {
    pub asset: String,
    pub book_pda: String,
    pub seller: String,
    pub collection: String,
    pub price: i64,
    pub status: String,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
    pub name: String,
    pub cover_url: Option<String>,
    pub author: Option<String>,
    pub series: Option<String>,
    pub category: String,
    pub condition: String,
    pub created_at: i64,
    pub updated_at: i64,
}

// 书籍图片
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BookImageRow {
    pub id: i64,
    pub asset: String,
    pub url: String,
    pub sort: i16,
    pub created_at: i64,
}

// 托管
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EscrowRow {
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub price: i64,
    pub state: String,
    pub shipping_commitment: Option<Vec<u8>>,
    pub created_at: i64,
    pub updated_at: i64,
}

// 分页通用
pub struct Page {
    pub limit: i64,
    pub offset: i64,
}

impl Page {
    pub fn new(page: i64, page_size: i64) -> Self {
        Self {
            limit: page_size,
            offset: (page - 1) * page_size,
        }
    }
}

// 市场筛选参数
#[derive(Debug, Default)]
pub struct BookFilter {
    pub keyword: Option<String>,
    pub category: Option<String>,
    pub condition: Option<String>,
    pub min_price: Option<i64>,
    pub max_price: Option<i64>,
    pub sort_by: BookSortBy,
}

#[derive(Debug, Default)]
pub enum BookSortBy {
    #[default]
    Newest,
    PriceAsc,
    PriceDesc,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct MessageRow {
    pub id: i64,
    pub from_pubkey: String,
    pub to_pubkey: String,
    pub content: serde_json::Value,
    pub timestamp: i64,
    pub is_read: bool,
}

// 会话列表中每个会话的最新一条消息
#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct ConversationRow {
    pub peer_pubkey: Option<String>,
    pub last_content: Option<serde_json::Value>,
    pub last_timestamp: Option<i64>,
    pub unread_count: Option<i64>,
}
