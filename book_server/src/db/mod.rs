use dotenvy::var;
use crate::DATABASE_URL_ENV;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

pub mod types;
pub mod user;
pub mod book;
pub mod escrow;
pub mod favorite;
pub mod review;
pub mod message;
pub mod sync;
pub mod encryption;
pub mod shipping_cipher;
pub mod tracking_cipher;
pub mod shipping_address;
pub mod escrow_event;
pub mod dispute_submission;
pub mod book_event;

pub use types::*;
pub use message::*;
pub use book::*;
pub use escrow::*;
pub use user::*;
pub use review::*;
pub use favorite::*;
pub use sync::*;
pub use encryption::*;
pub use shipping_cipher::*;
pub use tracking_cipher::*;
pub use shipping_address::*;
pub use escrow_event::*;
pub use book_event::*;
#[derive(Clone)]
pub struct DBService{
    db_pool:PgPool
}

impl DBService{
    pub async fn new()->Self{
        let db_url=var(DATABASE_URL_ENV).expect("缺少数据库环境变量");
        let db_pool=PgPoolOptions::new()
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
        Self{db_pool}
    }
}
