use serde::{Deserialize, Serialize};

///查询参数
#[derive(Deserialize)]
pub struct BookListQuery {
    pub name: Option<String>,
    pub author: Option<String>,
    pub category: Option<String>,
    pub condition: Option<String>,
    pub min_price: Option<i64>,
    pub max_price: Option<i64>,
    pub page: Option<i64>,  // 从1开始
    pub limit: Option<i64>, // 默认20，最大50
}

///书籍信息
#[derive(Serialize, sqlx::FromRow)]
pub struct BookListItem {
    pub asset: String,
    pub name: String,
    pub author: Option<String>,
    pub category: String,
    pub condition: String,
    pub price: i64,
    pub status: String,
    pub seller: String,
    pub metadata_uri: String,
}



/// 书籍列表响应（带分页信息）
#[derive(Serialize)]
pub struct BookListResponse {
    pub items: Vec<BookListItem>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
}

/// 托管订单详情
#[derive(Serialize, sqlx::FromRow)]
pub struct EscrowDetail {
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

/// 用户公开信息
#[derive(Serialize, sqlx::FromRow)]
pub struct UserProfile {
    pub pubkey: String,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub trade_count: i32,
    pub sell_count: i32,
    pub buy_count: i32,
    pub reputation: Option<f64>, // 从reviews实时计算
}

/// 评价
#[derive(Serialize, sqlx::FromRow)]
pub struct ReviewItem {
    pub id: i64,
    pub escrow_pda: String,
    pub reviewer: String,
    pub score: i16,
    pub comment: Option<String>,
    pub created_at: i64,
}
