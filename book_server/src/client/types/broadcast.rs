use serde::Deserialize;

#[derive(Deserialize)]
pub struct BroadcastCreateBookRequest {
    pub signed_tx: String,//交易订单
    pub asset: String,//书的mpl地址
    pub book_pda: String,//书的链上地址
    pub seller: String,//卖家地址
    pub price: u64,//价格
    pub price_cny: Option<f64>,//人民币的价格
    pub fx_cny_per_sol: Option<f64>,//代币的价格
    pub metadata_url: String,//ipfs地址
    pub metadata_hash: Vec<u8>,//本地hash得到的地址
    pub name: String,//书名
    pub author: Option<String>,//作者
    pub series: Option<String>,//属于什么系列
    pub category: String,//
    pub condition: String,//书的现状描述
    pub cover_url: String,//封面地址
    pub detail_urls: Vec<String>,//详情图的地址
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
pub struct BroadcastCreateEscrowAutoRequest {
    pub signed_tx: String,
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
