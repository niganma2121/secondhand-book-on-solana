use std::sync::Arc;
use dotenvy::var;
use crate::auth::types::AuthService;
use crate::chat::types::ChatService;
use crate::client::types::AnchorService;
use anchor_client::solana_sdk::signature::read_keypair_file;
use crate::db::DBService;

#[derive(Clone)]
pub struct AppState{
    pub chat_service:Arc<ChatService>,
    pub auth_service: Arc<AuthService>,
    pub anchor_service: Arc<AnchorService>,
    pub db_service:DBService,//连接池
}

impl AppState{
    pub async fn new ()->Self{
        let admin_pubkey_url=var("ADMIN_KEYPAIR_URL").expect("缺少管理员密钥对");
        let keypair=read_keypair_file(&admin_pubkey_url)
            .expect("密钥加载失败");
        //TODO,需要删除和修改,目前chat需要使用暂时不管
        let admin_keypair=Arc::new(keypair);
        let chat_service=ChatService::new(admin_keypair.clone()).await;
        let anchor_service=Arc::new(AnchorService::new());
        let auth_service=Arc::new(AuthService::new());
        let db_service=DBService::new().await;

        Self{chat_service,auth_service,anchor_service,db_service}
    }
}