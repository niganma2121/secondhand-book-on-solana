use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use anchor_client::{Client, Cluster, CommitmentConfig};
use dashmap::DashMap;
use dotenvy::var;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use sonyflake::Sonyflake;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use crate::types::chat::ConnectionRegistry;
use crate::types::client::ProgramClient;

const LOCAL:Cluster=Cluster::Localnet;
const _DEV:Cluster=Cluster::Devnet;

#[derive(Clone)]
pub struct AppState{
    pub pgpool:PgPool,//连接池
    pub dash_map: ConnectionRegistry,//聊天路由映射表
    pub id_generator:Arc<Sonyflake>,
    pub program_id:Pubkey,
    jwt_secret:String,
    client:Arc<ProgramClient>,//客户端
    admin_keypair:Arc<Keypair>,//后端签名使用
}

impl AppState{
    pub async fn new ()->Self{
        //数据库配置
        let db_url=var("DATABASE_URL").expect("缺少数据库环境变量或地址错误");
        let pgpool=PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .idle_timeout(Duration::from_mins(10))
            .test_before_acquire(true)
            .connect(&db_url)
            .await
            .expect("数据库连接失败");
        //解决新增表问题
        sqlx::migrate!("./migrate")
            .run(&pgpool)
            .await
            .expect("数据库迁移失败,请检查");
        let admin_pubkey_url=var("ADMIN_PUBKEY_URL").expect("缺少管理员密钥对");
        let keypair=solana_sdk::signature::read_keypair_file(&admin_pubkey_url)
            .expect("密钥加载失败");
        ///TODO,装在服务器上的时候需要使用加密的重新new一个密钥对
        let admin_keypair=Arc::new(keypair);
        let payer=admin_keypair.clone();
        let dash_map=Arc::new(DashMap::new());
        let id_generator=Arc::new(Sonyflake::new().expect("id生成器生成器构建失败"));
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
        Self{pgpool,dash_map,id_generator,program_id,jwt_secret,client,admin_keypair}
    }

    pub fn get_program_client(&self)->Arc<ProgramClient>{
        self.client.clone()
    }
    pub fn get_admin_keypair(&self)->Arc<Keypair>{
        self.admin_keypair.clone()
    }

    pub fn get_jwt(&self)->&str{
        &self.jwt_secret
    }
}