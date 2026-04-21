use std::collections::HashMap;
use jsonwebtoken::TokenData;
use serde::{Deserialize, Serialize};
use jsonwebtoken::errors::Error;
use deadpool_redis::{Config, Pool, Runtime};
use dotenvy::var;

pub type JwtResult<T>=Result<TokenData<T>,Error>;

#[derive(Clone)]
pub struct AuthService{
    pub redis_pool:Pool,
    pub jwt_secret:String,//验证Token
    pub nonce_secret:String,//生成和验证nonce
}

impl AuthService{
    pub fn new()->Self{
        let  redis_url=var("REDIS_URL").expect("缺少REDIS_URL");
        let jwt_secret=var("JWT_SECRET").expect("JWT密钥加载失败");

        let nonce_secret=var("NONCE_SECRET").expect("JWT密钥加载失败");
        let cfg=Config::from_url(redis_url);
        let redis_pool=cfg.create_pool(Some(Runtime::Tokio1))
            .expect("Redis连接池创建失败");
        Self{
            redis_pool,
            jwt_secret,
            nonce_secret
        }
    }
}
#[derive(Debug,Serialize,Deserialize)]
pub struct Claims{
    pub sub:String,//存放钱包地址
    pub exp:usize,//存放时间戳
}

#[derive(Deserialize)]
pub struct LoginRequest{
    pub address:String,//钱包地址
    pub nonce:String,//校验值
    pub signature:String//钱包签名
}

#[derive(Serialize)]
pub struct AuthResponse{
    pub token:String
}

#[derive(Deserialize)]
pub struct StringMap{
    pub map:HashMap<String,String>
}
