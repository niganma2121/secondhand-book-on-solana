use std::sync::Arc;
use dotenvy::var;
use crate::ADMIN_KEYPAIR_URL_ENV;
use crate::auth::types::AuthService;
use crate::chat::types::ChatService;
use crate::client::types::AnchorService;
use crate::crypto::default_templates;
use crate::infra::fx_rate::FxRateService;
use anchor_client::solana_sdk::signature::read_keypair_file;
use sonyflake::Sonyflake;
use crate::db::DBService;

#[derive(Clone)]
pub struct AppState{
    pub chat_service:Arc<ChatService>,
    pub auth_service: Arc<AuthService>,
    pub anchor_service: Arc<AnchorService>,
    pub fx_rate_service: Arc<FxRateService>,
    pub db_service:DBService,//连接池
    pub id_generator:Arc<Sonyflake>,//雪花id生成
}

impl AppState{
    pub async fn new ()->Self{
        let admin_pubkey_url=var(ADMIN_KEYPAIR_URL_ENV).expect("缺少管理员密钥对");
        let keypair=read_keypair_file(&admin_pubkey_url)
            .expect("密钥加载失败");
        //TODO,需要删除和修改,目前chat需要使用暂时不管
        let admin_keypair=Arc::new(keypair);
        let chat_service=ChatService::new(admin_keypair.clone()).await;
        let anchor_service=Arc::new(AnchorService::new());
        let fx_rate_service = Arc::new(FxRateService::new());
        let auth_service=Arc::new(AuthService::new());
        let db_service=DBService::new().await;
        let now = chrono::Utc::now().timestamp();
        for tpl in default_templates() {
            db_service
                .upsert_encryption_template(
                    tpl.version,
                    tpl.message_template,
                    tpl.kdf_name,
                    &tpl.kdf_params,
                    true,
                    now,
                )
                .await
                .expect("初始化加密模板失败");
        }
        let id_generator=Arc::new(Sonyflake::new().expect("id生成器生成器构建失败"));

        Self{chat_service,auth_service,anchor_service,fx_rate_service,db_service,id_generator}
    }
}