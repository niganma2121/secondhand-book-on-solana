use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Review {
    pub id: i64,
    pub escrow_pda: String,
    pub reviewer: String,
    pub reviewee: String,
    pub score: i16,
    pub comment: Option<String>,
    pub created_at: i64,
}

pub struct CreateReviewParams<'a> {
    pub id: i64, // sonyflake 生成
    pub escrow_pda: &'a str,
    pub reviewer: &'a str,
    pub reviewee: &'a str,
    pub score: i16,
    pub comment: Option<&'a str>,
    pub created_at: i64,
}
