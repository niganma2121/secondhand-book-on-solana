use crate::types::auth::LoginRequest;
use anyhow::{Error, Result};
use crate::error::AuthError;
use crate::utils::auth_utils::{create_jwt, verify_stateless_nonce, verify_wallet_signature,};

pub fn sign_in(payload:LoginRequest,jwt_secret:&str)->Result<String>{
    //验证Nonce
    let is_nonce_valid=verify_stateless_nonce(
        &payload.address,
        &payload.nonce,
        jwt_secret
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