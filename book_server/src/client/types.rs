use super::BOOK_PROGRAM_ID;
use crate::client::error::ClientError;
use crate::{PINATA_API_KEY, PINATA_SECRET};
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signature::{EncodableKey, Keypair};
use anchor_client::{Client, Cluster, Program};
use dotenvy::var;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone)]
pub struct AnchorService {
    pub program_id: Pubkey,
    pub client: Arc<Client<Arc<Keypair>>>,
    pub admin_keypair: Arc<Keypair>,
    pub pinata_api_key: String,
    pub pinata_secret: String,
}

impl AnchorService {
    pub fn new() -> Self {
        let keypair_url = var("ADMIN_KEYPAIR_URL").expect("环境变量中不存在密钥对");
        let keypair = Keypair::read_from_file(keypair_url).expect("密钥对文件读取失败");
        let admin_keypair = Arc::new(keypair);

        let cluster = match var("SOLANA_CLUSTER").as_deref() {
            Ok("devnet") => Cluster::Devnet,
            Ok("testnet") => Cluster::Testnet,
            Ok("localhost") => Cluster::Localnet,
            _ => Cluster::Localnet,
        };
        let client = Arc::new(Client::new_with_options(
            cluster,
            admin_keypair.clone(),
            CommitmentConfig::confirmed(),
        ));
        let pinata_api_key = var(PINATA_API_KEY).expect("pinata:api-key加载失败");
        let pinata_secret = var(PINATA_SECRET).expect("pinata:密钥环境变量缺少");
        Self {
            program_id: BOOK_PROGRAM_ID,
            client,
            admin_keypair,
            pinata_api_key,
            pinata_secret,
        }
    }

    pub fn get_program(&self) -> Result<Program<Arc<Keypair>>, ClientError> {
        self.client
            .program(self.program_id)
            .map_err(|e| ClientError::ProgramError(e))
    }
}

// ================================
// 请求类型
// ================================

#[derive(Deserialize)]
pub struct CreateBookRequest {
    pub seller: String,
    pub collection: String,
    pub name: String,
    pub description: String,
    pub price: u64,
    pub condition: String,
    pub author: Option<String>,
    pub series: Option<String>,
    pub category: String,
    pub cover_image: Vec<u8>,
    pub cover_filename: String,
    pub detail_images: Vec<(Vec<u8>, String)>,
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

//接受前端的签名请求
#[derive(Deserialize)]
pub struct SignedTxRequest {
    pub signed_ex: String,
}

//发送前端签名
#[derive(Serialize)]
pub struct UnsignedTxResponse {
    pub tx: String,
    pub msg: String,
}

// create_book 第一步返回，包含元数据供前端广播时带回
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
pub struct MinResponse {
    pub asset: String,
    pub collection: String,
}

// ================================
// 查询响应类型
// ================================

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

//--------------广播部分------------

//前端签名后调用广播，把第一步拿到的元数据带回来
#[derive(Deserialize)]
pub struct BroadcastCreateBookRequest {
    pub signed_tx: String,
    pub asset: String,
    pub book_pda: String,
    pub seller: String,
    pub collection: String,
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
// 更新价格广播，需要知道新价格写库
#[derive(Deserialize)]
pub struct BroadcastUpdatePriceRequest {
    pub signed_tx: String,
    pub asset: String,
    pub new_price: u64,
}
// 下架广播，需要知道 asset 以便更新数据库状态
#[derive(Deserialize)]
pub struct BroadcastDelistRequest {
    pub signed_tx: String,
    pub asset: String,
    pub seller: String,
}
// 创建托管广播，需要知道双方信息写库
#[derive(Deserialize)]
pub struct BroadcastCreateEscrowRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub price: u64,
}

//取消订单
#[derive(Deserialize)]
pub struct BroadcastCancelEscrowRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
}

// 发货广播
#[derive(Deserialize)]
pub struct BroadcastShipRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub shipping_commitment: Vec<u8>,
}

// 确认收货广播，需要知道双方地址更新计数
#[derive(Deserialize)]
pub struct BroadcastConfirmReceiptRequest {
    pub signed_tx: String,
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
}

//开启仲裁
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
    // 裁决偏向谁决定最终 escrow state
    pub choice: u8,
}

#[derive(Serialize)]
pub struct BroadcastResponse {
    pub signature: String,
    pub msg: String,
}
