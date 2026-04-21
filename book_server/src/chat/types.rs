use anchor_client::anchor_lang::prelude::Pubkey;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use dotenvy::var;
use sonyflake::Sonyflake;
use sqlx::PgPool;
use tokio::sync::mpsc::Sender;
use crate::chat::util;
use solana_sdk::signature::{Keypair, Signer};
use sqlx::postgres::PgPoolOptions;

pub type ConnectionRegistry = Arc<DashMap<Pubkey, UserConnection>>;
#[derive(Clone)]
pub struct ChatService{
    pub dash_map: ConnectionRegistry,//聊天路由映射表
    pub id_generator:Arc<Sonyflake>,//雪花id生成
    pub pgpool:PgPool,//连接池
    admin_keypair:Arc<Keypair>
}
impl ChatService{
    pub async fn new(admin_keypair:Arc<Keypair>)->Arc<Self>{
        let dash_map=Arc::new(DashMap::new());
        let id_generator=Arc::new(Sonyflake::new().expect("id生成器生成器构建失败"));

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

        let s=Self{dash_map,id_generator,pgpool,admin_keypair};
        Arc::new(s)
    }
    pub fn get_admin_key(&self)->Pubkey{
        self.admin_keypair.pubkey()
    }
}
#[derive(Deserialize)]
#[serde(tag = "action", content = "data")]
pub enum ClientCommand {
    SendMessage(ChatMessage),
    Sync(SyncRequest),
}

//用于客户端重连接的时候受到客户端缓存的最大值
#[derive(Deserialize)]
pub struct SyncRequest {
    pub last_id: u64, // 客户端本地存的最大雪花 ID
}
///消息
#[derive(Deserialize, Serialize,Clone)]
pub struct ChatMessage {
    pub id: u64, //唯一性去重
    #[serde(with = "util")]
    pub from: Pubkey,
    #[serde(with = "util")]
    pub to: Pubkey,
    pub timestamp: i64,
    pub content: MessageContent,
}

impl ChatMessage {
    pub fn new(id: u64, from: Pubkey, to: Pubkey, timestamp: i64, content: MessageContent) -> Self {
        Self {
            id,
            from,
            to,
            timestamp,
            content,
        }
    }
}

//聊天信息内容
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag="type",content="payload")]
pub enum MessageContent {
    /*用户聊天之间的信息内容*/
    Text {
        content: String,
    },
    Image {
        url: String,
        caption: Option<String>,
    },
    /*书籍交易的核心信息,便于一同推送,如京东一般*/
    BookOffer {
        asset_id: String, //NFT
        price: i64,
        description: String,
    },
    //买家可以给卖家砍价
    PurchaseRequest {
        original_id: String,              //对应与哪个BookOffer,
        transaction_link: Option<String>, //交易构建之后的连接
    },
    PurchaseReject {
        original_offer_id: String,
        reason: String,
    },
    /*系统消息,用于推送一些信息*/
    System {
        level: SystemLevel,
    },
    /*消息回执*/
    Typing,
    ReadReceipt {
        //已读回执
        message_id: String,
    },
    Delivered {
        //已送达回执
        message: String,
    },
    //消息错误
    Error {
        code: u16,
        message: String,
    },
}
#[derive(Serialize, Debug, Deserialize, Clone, PartialEq)]
pub enum SystemLevel {
    Info,
    Success,
    Warning,
    Error,
}
///用户的连接
pub struct UserConnection {
    pub tx: Sender<ChatMessage>,
    pub derive_info: UserInfo,
}

///用户信息
#[derive(Debug, Clone)]
pub struct UserInfo {
    pub pubkey: Pubkey,
    pub user_name: Option<String>,
    pub avatar: Option<String>,
}
impl UserInfo{
    pub fn new(pubkey:Pubkey,user_name:Option<String>,avatar:Option<String>)->Self{
        Self{pubkey,user_name,avatar}
    }
}