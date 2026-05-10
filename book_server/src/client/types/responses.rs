use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct UnsignedTxResponse {
    pub tx: String,
    pub msg: String,
}

#[derive(Serialize)]
pub struct CreateBookTxResponse {
    pub tx: String,
    pub asset: String,
    pub book_pda: String,
    pub msg: String,
    pub cover_url: String,
    pub detail_urls: Vec<String>,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
}

#[derive(Serialize)]
pub struct CreateBookUploadImageResponse {
    pub cid: String,
    pub url: String,
    pub mime_type: String,
    pub msg: String,
}

#[derive(Serialize)]
pub struct CreateBookMetadataResponse {
    pub metadata_cid: String,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
    pub msg: String,
}

#[derive(Serialize)]
pub struct PinataSignedUploadResponse {
    pub upload_url: String,
    pub expires_in: u64,
    pub max_file_size: u64,
    pub ipfs_gateway_base: String,
    pub msg: String,
}

#[derive(Serialize)]
pub struct InitCollectionResponse {
    pub collection: String,
    pub signature: String,
    pub msg: String,
}

#[derive(Serialize)]
pub struct MinResponse {
    pub asset: String,
    pub collection: String,
}

#[derive(Serialize, Deserialize)]
pub struct BookInfo {
    pub book_pda: String,
    pub asset: String,
    pub seller: String,
    pub price: u64,
    pub status: String,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
pub struct EscrowInfo {
    pub escrow_pda: String,
    pub seller: String,
    pub buyer: String,
    pub asset: String,
    pub price: u64,
    pub state: String,
    pub created_at: i64,
}

#[derive(Serialize)]
pub struct BroadcastResponse {
    pub signature: String,
    pub msg: String,
    /// 为 `Some` 时表示本次广播是否已写入数据库（用于链上已成功但库可能延迟的场景）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub db_synced: Option<bool>,
    /// 内部排查或客服用简短说明；一般不展示给最终用户时可省略。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub db_sync_note: Option<String>,
}

impl BroadcastResponse {
    pub fn new(signature: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            signature: signature.into(),
            msg: msg.into(),
            db_synced: None,
            db_sync_note: None,
        }
    }

    /// 链上已确认后，标明数据库是否已与链上一致。
    pub fn chain_confirmed(
        signature: impl Into<String>,
        msg: impl Into<String>,
        db_synced: bool,
        db_sync_note: Option<String>,
    ) -> Self {
        Self {
            signature: signature.into(),
            msg: msg.into(),
            db_synced: Some(db_synced),
            db_sync_note: db_sync_note,
        }
    }
}
