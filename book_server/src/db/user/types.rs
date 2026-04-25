use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub pubkey: String,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub trade_count: i32,
    pub sell_count: i32,
    pub buy_count: i32,
    pub created_at: i64,
}