use std::sync::Arc;
use anchor_client::{Client, Cluster, CommitmentConfig,Program};
use solana_sdk::pubkey::Pubkey;
use dotenvy::{var};
use solana_sdk::message::Address;
use solana_sdk::signature::{EncodableKey, Keypair};
use crate::client::error::ClientError;
use super::ID;

#[derive(Clone)]
pub struct AnchorService{
    pub program_id:Pubkey,
    pub client:Arc<Client<Arc<Keypair>>>,//客户端
    pub admin_keypair:Arc<Keypair>,//后端签名使用
}
impl AnchorService{
    pub fn new()->Self{
        let keypair_url=var("ADMIN_URL").expect("环境变量中不存在密钥对");
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
        Self{
            program_id: Address::from(ID.to_bytes()),//相当无语,,,,,库冲突,降级0.31.1又尼玛config是私有的
            client,
            admin_keypair
        }
    }
    pub fn get_program(&self)->Result<Program<Arc<Keypair>>,ClientError>{
        self.client.program(self.program_id).map_err(
            |e|ClientError::ProgramError(e)
        )
    }
}




