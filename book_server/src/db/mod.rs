pub mod book;
pub mod escrow;
pub mod review;
pub mod user;
pub mod book_images;
pub mod favorites;
use std::time::Duration;
use dotenvy::var;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
pub use book::*;
pub use escrow::*;
pub use review::*;
pub use user::*;

#[derive(Clone)]
pub struct DBService{
    pub pool:PgPool
}

impl DBService{
    pub async fn new()->Self{
        //数据库配置
        let db_url=var("DATABASE_URL").expect("缺少数据库环境变量或地址错误");
        let pool=PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .idle_timeout(Duration::from_mins(10))
            .test_before_acquire(true)
            .connect(&db_url)
            .await
            .expect("数据库连接失败");
        //解决新增表问题
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("数据库迁移失败,请检查");
        Self{pool}
    }
}