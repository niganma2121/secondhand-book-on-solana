use serde::{Deserialize, Serialize};
use serde_json::Value;
use chrono::Utc;

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
    /// 信誉分 0–100，默认 100
    pub reputation_score: f64,
    pub dispute_total: i32,
    pub dispute_won: i32,
    pub dispute_lost: i32,
    pub created_at: i64,
    /// UTC 自然日 YYYYMMDD，与 `username_edit_count` 同属「当日昵称修改次数」统计
    pub username_edit_day: i32,
    pub username_edit_count: i32,
}

impl UserRow {
    /// UTC 自然日 `YYYYMMDD`
    pub fn utc_yyyymmdd() -> i32 {
        Utc::now().format("%Y%m%d").to_string().parse().unwrap_or(0)
    }

    /// 当日还可修改昵称的次数（每天最多成功修改 3 次）
    pub fn username_changes_remaining_today(&self) -> i32 {
        let today = Self::utc_yyyymmdd();
        let used = if self.username_edit_day == today {
            self.username_edit_count
        } else {
            0
        };
        (3 - used).max(0)
    }
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

/// 仲裁工作台：争议中托管 + 书籍 collection（用于组 `resolve_dispute` 交易）
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct ArbitrationDisputeRow {
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub price: i64,
    pub book_snapshot: Option<Value>,
    pub collection: String,
    pub updated_at: i64,
    /// 已在 `escrow_dispute_submissions` 中提交过材料的公钥列表（顺序按提交时间）
    pub dispute_submitters: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EscrowDisputeSubmissionRow {
    pub escrow_pda: String,
    pub initiator: String,
    pub public_text: String,
    pub public_attachment_urls: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_text: Option<String>,
    pub created_at: i64,
}

// 托管
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EscrowRow {
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub cancelled_by: Option<String>,
    pub price: i64,
    pub state: String,
    pub shipping_commitment: Option<Vec<u8>>,
    /// 内部幂等标记，不暴露给订单 API 响应
    #[serde(skip_serializing)]
    pub trade_count_applied: bool,
    /// 与订单 1:1：创建/复活为 Paid 时写入，后续不重写
    pub book_snapshot: Option<Value>,
    pub pre_ship_locked: bool,
    pub created_at: i64,
    pub updated_at: i64,
    /// 首次进入仲裁的 Unix 秒（材料更新不改）
    pub disputed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EscrowDisputeSubmissionRevisionRow {
    pub id: i64,
    pub escrow_pda: String,
    pub initiator: String,
    pub public_text: String,
    pub public_attachment_urls: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_text: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EscrowEventRow {
    pub id: i64,
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub from_state: Option<String>,
    pub to_state: String,
    pub action: String,
    pub tx_signature: Option<String>,
    pub actor_pubkey: Option<String>,
    pub created_at: i64,
    /// 仲裁结案等结构化字段（如 winner、return_book）
    pub payload: Option<Value>,
    /// 来自 `escrows.book_snapshot`（JOIN），同一 escrow_pda 多行事件值相同
    pub book_snapshot: Option<Value>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BookEventRow {
    pub id: i64,
    pub asset: String,
    pub event_type: String,
    pub from_owner: Option<String>,
    pub to_owner: Option<String>,
    pub escrow_pda: Option<String>,
    pub tx_signature: Option<String>,
    pub actor_pubkey: Option<String>,
    pub payload: Option<Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct BoughtBookRow {
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
    pub is_current_owner: bool,
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
    pub peer_username: Option<String>,
    pub peer_avatar: Option<String>,
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

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct EscrowTrackingCipherRow {
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

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserShippingAddressRow {
    pub id: i64,
    pub user_pubkey: String,
    pub buyer_ciphertext: String,
    pub buyer_nonce: String,
    pub buyer_alg: String,
    pub encryption_key_version: String,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}
