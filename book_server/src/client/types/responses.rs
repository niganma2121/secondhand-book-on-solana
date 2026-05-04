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
}
