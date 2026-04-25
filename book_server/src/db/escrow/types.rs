use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EscrowInfo{
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

pub struct CreateEscrowParams<'a> {
    pub escrow_pda: &'a str,
    pub asset: &'a str,
    pub seller: &'a str,
    pub buyer: &'a str,
    pub price: i64,
    pub created_at: i64,
}
