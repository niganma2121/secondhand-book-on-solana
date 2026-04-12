use std::sync::Arc;
use std::time::Duration;
use dotenvy::var;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use sonyflake::Sonyflake;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use crate::types::chat::ConnectionRegistry;
use crate::types::client::ProgramClient;

#[derive(Clone)]
pub struct AppState{
    pgpool:PgPool,//连接池
    dash_map: ConnectionRegistry,//聊天路由映射表
    id_generator:Arc<Sonyflake>,
    client:Arc<ProgramClient>,//客户端
    program_id:Pubkey,
    admin_keypair:Arc<Keypair>,//后端签名使用
}

impl AppState{
    pub async fn new ()->Self{
        let db_url=var("DATABASE_URL").expect("缺少数据库环境变量或地址错误");
        let pgpool=PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .idle_timeout(Duration::from_mins(10))
            .test_before_acquire(true)
            .connect(&db_url)
            .await
            .expect("数据库连接失败");
        todo!();
        //
        // Self{
        //     pgpool,
        //
        // }
    }
}