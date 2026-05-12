use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct BookImageUpload {
    pub bytes: Vec<u8>,
    pub filename: String,
    pub mime_type: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateBookRequest {
    pub seller: String,
    pub name: String,
    pub description: String,
    pub price: u64,
    pub condition: String,
    pub author: Option<String>,
    pub series: Option<String>,
    pub category: String,
    pub cover_image: Vec<u8>,
    pub cover_filename: String,
    pub cover_mime_type: Option<String>,
    pub detail_images: Vec<BookImageUpload>,
}

#[derive(Deserialize)]
pub struct CreateBookMetadataRequest {
    pub seller: String,
    pub name: String,
    pub description: String,
    pub condition: String,
    pub cover_url: String,
    pub details: Vec<CreateBookMetadataDetailItem>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CreateBookMetadataDetailItem {
    pub url: String,
    pub mime_type: String,
}

#[derive(Deserialize)]
pub struct CreateBookBuildTxRequest {
    pub seller: String,
    pub name: String,
    pub price: u64,
    pub cover_url: String,
    pub detail_urls: Vec<String>,
    pub metadata_cid: String,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
}

#[derive(Deserialize)]
pub struct RelistBookBuildTxRequest {
    pub seller: String,
    pub asset: String,
    pub price: u64,
    pub cover_url: String,
    pub detail_urls: Vec<String>,
    pub metadata_cid: String,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
}

#[derive(Deserialize)]
pub struct PinataUploadSignBody {
    pub purpose: Option<String>,
}

#[derive(Deserialize)]
pub struct InitCollectionRequest {
    pub name: String,
    pub uri: String,
}

#[derive(Deserialize)]
pub struct DelistBookRequest {
    pub seller: String,
    pub asset: String,
    pub collection: String,
}

#[derive(Deserialize)]
pub struct UpdatePriceRequest {
    pub seller: String,
    pub asset: String,
    pub new_price: u64,
}

#[derive(Deserialize)]
pub struct CreateEscrowRequest {
    pub buyer: String,
    pub seller: String,
    pub asset: String,
    pub collection: String,
}

#[derive(Deserialize)]
pub struct ShipBookRequest {
    pub seller: String,
    pub buyer: String,
    pub asset: String,
    pub shipping_commitment: [u8; 32],
}

#[derive(Deserialize)]
pub struct ConfirmReceiptRequest {
    pub buyer: String,
    pub seller: String,
    pub asset: String,
    pub collection: String,
}

#[derive(Deserialize)]
pub struct CancelEscrowRequest {
    pub signer: String,
    pub buyer: String,
    pub seller: String,
    pub asset: String,
    pub collection: String,
}

#[derive(Deserialize)]
pub struct OpenDisputeRequest {
    pub signer: String,
    pub buyer: String,
    pub seller: String,
    pub asset: String,
}

#[derive(Deserialize)]
pub struct ResolveDisputeRequest {
    pub arbitrator: String,
    pub buyer: String,
    pub seller: String,
    pub asset: String,
    pub collection: String,
    pub choice: u8,
    pub refund_amount: u64,
    pub return_book: bool,
}

#[derive(Deserialize)]
pub struct SignedTxRequest {
    pub signed_ex: String,
}
