use std::sync::Arc;
use dotenvy::var;
use crate::auth::types::AuthService;
use crate::chat::types::ChatService;
use crate::client::types::AnchorService;

#[derive(Clone)]
pub struct AppState{
    pub chat_service:Arc<ChatService>,
    pub auth_service: Arc<AuthService>,
    pub anchor_service: Arc<AnchorService>
}

impl AppState{
    pub async fn new ()->Self{
        let admin_pubkey_url=var("ADMIN_PUBKEY_URL").expect("缺少管理员密钥对");
        let keypair=solana_sdk::signature::read_keypair_file(&admin_pubkey_url)
            .expect("密钥加载失败");
        //TODO,需要删除和修改,目前chat需要使用暂时不管
        let admin_keypair=Arc::new(keypair);
        let chat_service=ChatService::new(admin_keypair.clone()).await;
        let anchor_service=Arc::new(AnchorService::new());
        let auth_service=Arc::new(AuthService::new());
        Self{chat_service,auth_service,anchor_service}
    }
}