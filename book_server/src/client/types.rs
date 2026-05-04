use super::BOOK_PROGRAM_ID;
use crate::client::error::ClientError;
use crate::{
    ADMIN_KEYPAIR_URL_ENV, BOOK_COLLECTION_ENV, PINATA_API_KEY_ENV,
    PINATA_GATEWAY_BASE_DEFAULT, PINATA_GATEWAY_BASE_ENV, PINATA_JWT_ENV,
    PINATA_SECRET_ENV, SOLANA_CLUSTER_ENV, SOLANA_RPC_URL_ENV, SOLANA_WS_URL_ENV,
};
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signature::{EncodableKey, Keypair};
use anchor_client::{Client, Cluster, Program};
use dotenvy::var;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;

#[derive(Clone)]
pub struct AnchorService {
    pub program_id: Pubkey,
    pub client: Arc<Client<Arc<Keypair>>>,
    pub admin_keypair: Arc<Keypair>,
    pub pinata_api_key: Option<String>,
    pub pinata_secret: Option<String>,
    pub pinata_jwt: Option<String>,
    pub pinata_gateway_base: String,
    pub book_collection: Pubkey,
}

impl AnchorService {
    pub fn new() -> Self {
        let keypair_url = var(ADMIN_KEYPAIR_URL_ENV).expect("环境变量中不存在密钥对");
        let keypair = Keypair::read_from_file(keypair_url).expect("密钥对文件读取失败");
        let admin_keypair = Arc::new(keypair);

        let rpc_url = var(SOLANA_RPC_URL_ENV).ok().filter(|v| !v.trim().is_empty());
        let ws_url = var(SOLANA_WS_URL_ENV).ok().filter(|v| !v.trim().is_empty());
        if matches!((&rpc_url, &ws_url), (Some(_), None) | (None, Some(_))) {
            panic!(
                "Solana 自定义节点需要同时设置 {} 与 {}",
                SOLANA_RPC_URL_ENV, SOLANA_WS_URL_ENV
            );
        }
        let cluster = if let (Some(rpc), Some(ws)) = (rpc_url, ws_url) {
            Cluster::Custom(rpc, ws)
        } else {
            match var(SOLANA_CLUSTER_ENV).as_deref() {
                Ok("devnet") => Cluster::Devnet,
                Ok("testnet") => Cluster::Testnet,
                Ok("localhost") => Cluster::Localnet,
                _ => Cluster::Localnet,
            }
        };
        let client = Arc::new(Client::new_with_options(
            cluster,
            admin_keypair.clone(),
            CommitmentConfig::confirmed(),
        ));
        let pinata_jwt = var(PINATA_JWT_ENV).ok().filter(|v| !v.trim().is_empty());
        let pinata_api_key = var(PINATA_API_KEY_ENV).ok().filter(|v| !v.trim().is_empty());
        let pinata_secret = var(PINATA_SECRET_ENV).ok().filter(|v| !v.trim().is_empty());
        if pinata_jwt.is_none() && (pinata_api_key.is_none() || pinata_secret.is_none()) {
            panic!(
                "Pinata配置缺失：请设置 {}，或同时设置 {} 与 {}",
                PINATA_JWT_ENV, PINATA_API_KEY_ENV, PINATA_SECRET_ENV
            );
        }
        let pinata_gateway_base =
            var(PINATA_GATEWAY_BASE_ENV).unwrap_or_else(|_| PINATA_GATEWAY_BASE_DEFAULT.to_string());
        let book_collection = Pubkey::from_str(
            &var(BOOK_COLLECTION_ENV).expect("缺少 BOOK_COLLECTION 环境变量"),
        )
        .expect("BOOK_COLLECTION 不是有效的 Solana 地址");
        Self {
            program_id: BOOK_PROGRAM_ID,
            client,
            admin_keypair,
            pinata_api_key,
            pinata_secret,
            pinata_jwt,
            pinata_gateway_base,
            book_collection,
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

/// 分步上架：生成 metadata JSON 并上传（不含图片二进制）。
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

/// 分步上架：仅根据已有 metadata 与 URL 组装链上交易。
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

/// 申请 Pinata 直传用的一次性上传 URL（需配合登录 + 限流）。
#[derive(Deserialize)]
pub struct PinataUploadSignBody {
    /// `cover` 或 `detail`（缺省按 detail 处理）
    pub purpose: Option<String>,
}

#[derive(Serialize)]
pub struct PinataSignedUploadResponse {
    pub upload_url: String,
    pub expires_in: u64,
    pub max_file_size: u64,
    pub ipfs_gateway_base: String,
    pub msg: String,
}

/// 仅用于初始化平台默认 collection（通常只需要调用一次）。
#[derive(Deserialize)]
pub struct InitCollectionRequest {
    /// collection 展示名称（链上 metadata 名称）
    pub name: String,
    /// collection 的元数据 URI（建议指向一份固定 JSON）
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
