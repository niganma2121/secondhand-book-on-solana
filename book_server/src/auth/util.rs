//无状态Nonce
//nonce = timestamp + hmac(timestamp + address, secret)
use chrono::Utc;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
type HmacSha256 = Hmac<Sha256>;
use anyhow::Result;
use ed25519_dalek::{VerifyingKey, Signature, Verifier};
use jsonwebtoken::{decode, Algorithm, DecodingKey, EncodingKey, Header, TokenData, Validation};
use redis::{AsyncCommands};
use crate::auth::error::AuthError;
use crate::auth::types::{Claims};

/* nonce*/
//产生nonce
pub fn generate_stateless_nonce(address: &str, secret: &str) -> Result<String> {
    let timestamp = Utc::now().timestamp();
    let data = format!("{}:{}", address, timestamp);

    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(secret.as_bytes())
        .map_err(|_|AuthError::InvalidSecretLength)?;
    mac.update(data.as_bytes());
    let res = mac.finalize().into_bytes();

    Ok(format!("{}.{}", timestamp, bs58::encode(res).into_string()))
}

//验证nonce
pub fn verify_stateless_nonce(addr: &str, nonce: &str, secret: &str) -> Result<bool> {
    let parts: Vec<&str> = nonce.split('.').collect();
    if parts.len() != 2 {
        return Ok(false)
    }
    let time_stamp_str=parts[0];
    let provided_hash=parts[1];

    //校验是否过期
    let ts=time_stamp_str.parse::<i64>()
        .map_err(|_| AuthError::InvalidNonceFormat)?;
    let now=Utc::now().timestamp();
    if (now-ts).abs()>300{
        return Ok(false)
    }

    //重新计算哈希
    let data=format!("{}:{}",addr,time_stamp_str);
    let mut mac=<HmacSha256 as KeyInit>::new_from_slice(
        secret.as_bytes()
    ).map_err(|_|AuthError::InvalidSecretLength)?;
    mac.update(data.as_bytes());

    let code_bytes=mac.finalize().into_bytes();
    let expected_hash=bs58::encode(code_bytes).into_string();

    Ok(expected_hash==provided_hash)
}


// 验证逻辑,验证钱包的签名
pub fn verify_wallet_signature(
    addr:&str,
    sig_base58:&str,
    msg:&str,
)->Result<bool>{
    //解码钱包地址
    let pubkey_bytes=bs58::decode(addr).into_vec()
        .map_err(|_|AuthError::InvalidAddress)?;

    //解码签名
    let sig_bytes=bs58::decode(sig_base58).into_vec()
        .map_err(|_| AuthError::InvalidSignature)?;

    // 构造验证签名Key和签名对象
    let public_key=VerifyingKey::from_bytes(
        &pubkey_bytes[..32].try_into()?
    ).map_err(|_| AuthError::PubkeyError)?;

    let signature=Signature::from_slice(&sig_bytes)
        .map_err(|_| AuthError::InvalidSignature)?;

    //执行验证
    Ok(Verifier::verify(&public_key, msg.as_bytes(), &signature).is_ok())
}

//颁发JWT认证
pub fn create_jwt(address:&str,secret:&str)->Result<String>{
    let expiration=Utc::now()
        .checked_add_signed(chrono::Duration::hours(48))
        .ok_or_else(|| AuthError::TimeError)?
        .timestamp() as usize;

    let claim=Claims{
        sub:address.to_string(),
        exp:expiration
    };

    let token = jsonwebtoken::encode(
        &Header::default(),
        &claim,
        &EncodingKey::from_secret(secret.as_bytes()),
    ).map_err(|e|  AuthError::JWTCrateFailed(e.to_string()))?;

    Ok(token)
}

//验证token
pub fn decode_jwt(token:&str,secret:&str)->Result<TokenData<Claims>, AuthError> {
    //校验
    let validation = Validation::new(Algorithm::HS256);
    //解码并验证,自动校验时间
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    ).map_err(|e| {
        // 这里的错误会直接触发中间件的 401
         AuthError::JwtVerifyFailed(e.to_string())
    })?;

    Ok(token_data)
}

//redis nonce
pub async fn store_nonce(pool: &deadpool_redis::Pool, address: &str, nonce: &str) -> Result<(), AuthError> {
    let mut connection = pool.get().await
        .map_err(|e| AuthError::Internal(e.to_string()))?;

    let key = format!("nonce:{}:{}", address, nonce);

    let set: bool = redis::cmd("SET")
        .arg(&key)
        .arg(1u8)
        .arg("EX")
        .arg(300u64)
        .arg("NX")
        .query_async(&mut connection)
        .await
        .map_err(|e|AuthError::Internal(e.to_string()))?;

    if !set {
        return Err(AuthError::Unauthorized("Nonce 已被使用".into()));
    }
    Ok(())
}

//登录的时候原子删除
pub async fn consume_nonce(pool:&deadpool_redis::Pool,address:&str,nonce:&str)->Result<bool,AuthError>{
    let mut connection=pool.get().await
        .map_err(|e|AuthError::Internal(e.to_string()))?;

    let key=format!("nonce:{}:{}",address,nonce);
    let deleted:u64=redis::cmd("DEL")
        .arg(&key)
        .query_async(&mut connection)
        .await
        .map_err(|e|AuthError::Internal(format!("Redis删除失败:{e}")))?;

    Ok(deleted>0)
}

//登出的时候Redis黑名单
pub async fn blacklist_jwt(pool:&deadpool_redis::Pool,jti:&str,ttl_secs:u64)->Result<(),AuthError>{
    let mut connection=pool.get().await
        .map_err(|e|AuthError::Internal(e.to_string()))?;

    let key=format!("jwt:blacklist:{}",jti);
    let _:()=redis::cmd("SET")
        .arg(&key)
        .arg(1u8)
        .arg("EX")
        .arg(ttl_secs)//过期时间
        .query_async(&mut connection)
        .await
        .map_err(|e|AuthError::Internal(format!("拉黑JWT失败,{e}")))?;

    Ok(())
}

//判断是否在黑名单中
pub async fn is_jwt_blacklist(pool:&deadpool_redis::Pool,jti:&str)->Result<bool,AuthError>{
    let mut connection=pool.get().await
        .map_err(|e|AuthError::Internal(e.to_string()))?;

    let key=format!("jwt:blacklist:{}",jti);
    let exists:bool=connection.exists(&key).await
        .map_err(|e|AuthError::Internal(e.to_string()))?;
    Ok(exists)
}
