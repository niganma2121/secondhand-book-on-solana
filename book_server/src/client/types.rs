use std::sync::Arc;
use anchor_client::{Client, Cluster,Program};
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signature::{EncodableKey, Keypair};
use dotenvy::{var};
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use serde::{Deserialize, Serialize};
use crate::client::error::ClientError;
use crate::{PINATA_API_KEY, PINATA_SECRET};
use super::BOOK_PROGRAM_ID;

#[derive(Clone)]
pub struct AnchorService{
    pub program_id:Pubkey,
    pub client:Arc<Client<Arc<Keypair>>>,//客户端
    pub admin_keypair:Arc<Keypair>,//后端签名使用,
    pub pinata_api_key:String,
    pub pinata_secret:String
}
impl AnchorService{
    pub fn new()->Self{
        let keypair_url=var("ADMIN_KEYPAIR_URL").expect("环境变量中不存在密钥对");
        let keypair=Keypair::read_from_file(keypair_url).expect("密钥对文件读取失败");
        let admin_keypair=Arc::new(keypair);

        let cluster=match var("SOLANA_CLUSTER").as_deref() {
            Ok("devnet") =>Cluster::Devnet,
            Ok("testnet")=>Cluster::Testnet,
            Ok("localhost")=>Cluster::Localnet,
            _=>Cluster::Localnet,
        };
        let client=Arc::new(Client::new_with_options(
           cluster,
           admin_keypair.clone(),
           CommitmentConfig::confirmed()
        ));
        let pinata_api_key=var(PINATA_API_KEY).expect("pinata:api-key加载失败");
        let pinata_secret=var(PINATA_SECRET).expect("pinata:密钥环境变量缺少");
        Self{
            program_id:BOOK_PROGRAM_ID,
            client,
            admin_keypair,
            pinata_api_key,
            pinata_secret
        }
    }
    pub fn get_program(&self)->Result<Program<Arc<Keypair>>,ClientError>{
        self.client.program(self.program_id).map_err(
            |e|ClientError::ProgramError(e)
        )
    }
}

//---------------------请求---------------------
#[derive(Deserialize)]
pub struct CreateBookRequest{
    pub seller:String,
    pub collection:String,
    pub name:String,
    pub description:String,
    pub price:u64,
    pub condition:String,
    pub cover_image:Vec<u8>,
    pub cover_filename:String,
    pub detail_images:Vec<(Vec<u8>,String)>//图片的详细细节
}

#[derive(Deserialize)]
pub struct DelistBookRequest{
    pub seller:String,
    pub asset:String,
    pub collection:String,
}

#[derive(Deserialize)]
pub struct UpdatePriceRequest{
    pub seller:String,
    pub asset:String,
    pub new_price:u64
}

#[derive(Deserialize)]
pub struct CreateEscrowRequest{
    pub buyer:String,
    pub seller:String,
    pub asset:String,
    pub collection:String,
}

#[derive(Deserialize)]
pub struct ShipBookRequest{
    pub seller:String,
    pub buyer:String,
    pub asset:String,
    pub shipping_commitment:[u8;32]
}
#[derive(Deserialize)]
pub struct ConfirmReceiptRequest{
    pub buyer:String,
    pub seller:String,
    pub asset:String,
    pub collection:String,
}

#[derive(Deserialize)]
pub struct CancelEscrowRequest{
    pub signer: String,
    pub buyer: String,
    pub seller: String,
    pub asset: String,
    pub collection: String,
}

#[derive(Deserialize)]
pub struct OpenDisputeRequest{
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

//------------交易响应----------------

#[derive(Serialize)]
pub struct MinResponse{
    pub asset:String,
    pub collection:String
}

#[derive(Serialize)]
pub struct UnsignedTxResponse{
    pub tx:String,
    pub msg:String,
}
#[derive(Serialize)]
pub struct CreateBookTxResponse{
    pub tx:String,
    pub asset:String,
    pub msg:String,
}


#[derive(Serialize)]
pub struct BroadcastResponse{
    pub signature:String,
    pub msg:String
}

//签名后返回的交易
#[derive(Deserialize)]
pub struct SignedTxRequest{
    pub signed_ex:String
}

// 查询响应类型
#[derive(Serialize, Deserialize)]
pub struct BookInfo {
    pub book_pda: String,
    pub asset: String,
    pub seller: String,
    pub price: u64,
    pub status: String,
    pub metadata_id: String,
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