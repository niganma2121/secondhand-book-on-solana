use std::collections::HashMap;
use jsonwebtoken::TokenData;
use serde::{Deserialize, Serialize};
use jsonwebtoken::errors::Error;

pub type JwtResult<T>=Result<TokenData<T>,Error>;
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
