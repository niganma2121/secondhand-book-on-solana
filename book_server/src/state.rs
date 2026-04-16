use std::str::FromStr;
use std::sync::Arc;
use anchor_client::{Client, Cluster, CommitmentConfig};
use dotenvy::var;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;

use crate::chat::types::ChatService;
use crate::types::client::ProgramClient;

const LOCAL:Cluster=Cluster::Localnet;
const _DEV:Cluster=Cluster::Devnet;

#[derive(Clone)]
pub struct AppState{
    pub chat_service:Arc<ChatService>,
    pub program_id:Pubkey,
    jwt_secret:String,//验证Token
    nonce_secret:String,//生成和验证nonce
    client:Arc<ProgramClient>,//客户端
    admin_keypair:Arc<Keypair>,//后端签名使用
}

impl AppState{
    pub async fn new ()->Self{
        let admin_pubkey_url=var("ADMIN_PUBKEY_URL").expect("缺少管理员密钥对");
        let keypair=solana_sdk::signature::read_keypair_file(&admin_pubkey_url)
            .expect("密钥加载失败");
        ///TODO,装在服务器上的时候需要使用加密的重新new一个密钥对
        let admin_keypair=Arc::new(keypair);
        let chat_service=ChatService::new(admin_keypair.clone()).await;

        let payer=admin_keypair.clone();
        let program_client=Client::new_with_options(
            LOCAL,
            payer,
            CommitmentConfig::confirmed()
        );
        let client=Arc::new(ProgramClient{
            client: Arc::new(program_client)
        });
        let program_id_url=var("PROGRAM_ID_URL").expect("程序ID url加载失败");
        let program_id=Pubkey::from_str(&program_id_url).expect("程序ID构建失败");
        let jwt_secret=var("JWT_SECRET").expect("JWT密钥加载失败");

        let nonce_secret=var("NONCE_SECRET").expect("JWT密钥加载失败");
        Self{chat_service,program_id,jwt_secret,nonce_secret,client,admin_keypair}
    }

    pub fn get_program_client(&self)->Arc<ProgramClient>{
        self.client.clone()
    }
    pub fn get_admin_keypair(&self)->Arc<Keypair>{
        self.admin_keypair.clone()
    }

    pub fn get_nonce_secret(&self)->&str{
        &self.nonce_secret
    }
    pub fn get_jwt_secret(&self)->&str{
        &self.jwt_secret
    }
}