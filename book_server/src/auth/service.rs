use anyhow::{Error, Result};
use crate::auth::error::AuthError;
use crate::auth::types::LoginRequest;
use crate::auth::util::{create_jwt, verify_stateless_nonce, verify_wallet_signature};

pub fn sign_in(payload:LoginRequest,nonce_secret:&str,jwt_secret:&str)->Result<String>{
    //验证Nonce
    let is_nonce_valid=verify_stateless_nonce(
        &payload.address,
        &payload.nonce,
        nonce_secret
    ).map_err(|t|AuthError::BadRequest(t.to_string()))?;

    if !is_nonce_valid{
        return Err(Error::from(AuthError::Unauthorized("Nonce 失效".into())))
    }

    //验证钱包签名
    let is_sig_valid=verify_wallet_signature(
        &payload.address,
        &payload.signature,
        &payload.nonce
    ).map_err(|e|AuthError::BadRequest(e.to_string()))?;

    if !is_sig_valid{
        return Err(Error::from(AuthError::Unauthorized("签名无效".into())))
    }
    //构建token
    let token=create_jwt(&payload.address,jwt_secret)
        .map_err(|e1| AuthError::Internal(e1.to_string()))?;
    Ok(token)
}