use serde::Deserialize;

#[derive(Deserialize)]
pub struct BroadcastCreateBookRequest {
    pub signed_tx: String,
    pub asset: String,
    pub book_pda: String,
    pub seller: String,
    pub price: u64,
    pub metadata_url: String,
    pub metadata_hash: Vec<u8>,
    pub name: String,
    pub author: Option<String>,
    pub series: Option<String>,
    pub category: String,
    pub condition: String,
    pub cover_url: String,
    pub detail_urls: Vec<String>,
}

#[derive(Deserialize)]
pub struct BroadcastUpdatePriceRequest {
    pub signed_tx: String,
    pub asset: String,
    pub new_price: u64,
}

#[derive(Deserialize)]
pub struct BroadcastDelistRequest {
    pub signed_tx: String,
    pub asset: String,
    pub seller: String,
}

#[derive(Deserialize)]
pub struct BroadcastCreateEscrowRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub price: u64,
}

#[derive(Deserialize)]
pub struct BroadcastCancelEscrowRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
}

#[derive(Deserialize)]
pub struct BroadcastShipRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub shipping_commitment: Vec<u8>,
}

#[derive(Deserialize)]
pub struct BroadcastConfirmReceiptRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
}

#[derive(Deserialize)]
pub struct BroadcastOpenDisputeRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
}

#[derive(Deserialize)]
pub struct BroadcastResolveDisputeRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub choice: u8,
}
