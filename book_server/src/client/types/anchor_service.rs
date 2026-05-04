use crate::client::BOOK_PROGRAM_ID;
use crate::client::error::ClientError;
use crate::{
    ADMIN_KEYPAIR_URL_ENV, BOOK_COLLECTION_ENV, PINATA_API_KEY_ENV, PINATA_GATEWAY_BASE_DEFAULT,
    PINATA_GATEWAY_BASE_ENV, PINATA_JWT_ENV, PINATA_SECRET_ENV, SOLANA_CLUSTER_ENV,
    SOLANA_RPC_URL_ENV, SOLANA_WS_URL_ENV,
};
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signature::{EncodableKey, Keypair};
use anchor_client::{Client, Cluster, Program};
use dotenvy::var;
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
        let book_collection =
            Pubkey::from_str(&var(BOOK_COLLECTION_ENV).expect("缺少 BOOK_COLLECTION 环境变量"))
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
            .map_err(ClientError::ProgramError)
    }
}
