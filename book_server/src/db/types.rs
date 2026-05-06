use serde::{Deserialize, Serialize};
use serde_json::Value;

//-------------------用户
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserRow {
    pub pubkey: String,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub enc_pubkey: Option<String>,
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
    pub price_cny: Option<f64>,
    pub fx_cny_per_sol: Option<f64>,
    pub status: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub author: Option<String>,
    pub category: String,
    pub condition: String,
    pub created_at: i64,
    pub seller_username: Option<String>,
}

/// 托管订单 + 书名（用于链上记录页，数据源为数据库同步的托管表）
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EscrowActivityRow {
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub price: i64,
    pub state: String,
    pub book_name: String,
    pub cover_url: Option<String>,
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
    pub price_cny: Option<f64>,
    pub fx_cny_per_sol: Option<f64>,
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

/// 上架表单 / 筛选用分类字典（表 `book_categories`）
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BookCategoryRow {
    pub key: String,
    pub label_zh: String,
    pub sort_order: i32,
}

/// 上架表单 / 筛选用品相字典（表 `book_conditions`）
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BookConditionRow {
    pub key: String,
    pub label_zh: String,
    pub description_zh: Option<String>,
    pub sort_order: i32,
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

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EncryptionTemplateRow {
    pub version: String,
    pub message_template: String,
    pub kdf_name: String,
    pub kdf_params: Value,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserEncryptionBackupRow {
    pub pubkey: String,
    pub backup_version: String,
    pub encrypted_private_key: String,
    pub nonce: String,
    pub kdf_salt: String,
    pub kdf_params: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EscrowShippingCipherRow {
    pub escrow_pda: String,
    pub buyer_pubkey: String,
    pub seller_pubkey: String,
    pub seller_ciphertext: String,
    pub seller_nonce: String,
    pub seller_alg: String,
    pub buyer_ciphertext: Option<String>,
    pub buyer_nonce: Option<String>,
    pub buyer_alg: Option<String>,
    pub encryption_key_version: String,
    pub created_at: i64,
    pub updated_at: i64,
}
