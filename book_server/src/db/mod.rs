use crate::DATABASE_URL_ENV;
use dotenvy::var;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

pub mod book;
pub mod book_event;
pub mod dispute_submission;
pub mod encryption;
pub mod escrow;
pub mod escrow_event;
pub mod favorite;
pub mod message;
pub mod review;
pub mod shipping_address;
pub mod shipping_cipher;
pub mod sync;
pub mod tracking_cipher;
pub mod types;
pub mod user;

pub use escrow::*;
pub use review::*;
pub use types::*;
#[derive(Clone)]
pub struct DBService {
    db_pool: PgPool,
}

impl DBService {
    pub async fn new() -> Self {
        let db_url = var(DATABASE_URL_ENV).expect("缺少数据库环境变量");
        let db_pool = PgPoolOptions::new()
            .max_connections(8)
            .min_connections(2)
            .idle_timeout(Duration::from_mins(10))
            .test_before_acquire(true)
            .connect(&db_url)
            .await
            .expect("数据库连接失败");
        sqlx::migrate!("./migrations")
            .run(&db_pool)
            .await
            .expect("数据库迁移失败");
        Self { db_pool }
    }
}
