use crate::auth::error::AuthError;
use crate::auth::types::{AuthService, LoginRequest};
use crate::auth::util::{
    blacklist_jwt, consume_nonce, create_jwt, decode_jwt, verify_stateless_nonce,
    verify_wallet_signature,
};
use anyhow::{Error, Result};
use chrono::Utc;

impl AuthService {
    pub async fn sign_in(&self, payload: LoginRequest) -> Result<String> {
        // 1) 校验 nonce 格式与 HMAC（与颁发时一致）
        let is_nonce_valid =
            verify_stateless_nonce(&payload.address, &payload.nonce, &self.nonce_secret)
                .map_err(|t| AuthError::BadRequest(t.to_string()))?;

        if !is_nonce_valid {
            return Err(Error::from(AuthError::Unauthorized("Nonce 失效".into())));
        }

        // 2) 先验证 Ed25519 签名，再消费 Redis 中的 nonce，避免「签名错误却把 nonce 删掉」
        let is_sig_valid =
            verify_wallet_signature(&payload.address, &payload.signature, &payload.nonce)
                .map_err(|e| AuthError::BadRequest(e.to_string()))?;

        if !is_sig_valid {
            return Err(Error::from(AuthError::Unauthorized("签名无效".into())));
        }

        let consumed = consume_nonce(&self.redis_pool, &payload.address, &payload.nonce).await?;
        if !consumed {
            return Err(Error::from(AuthError::Unauthorized(
                "Nonce已被使用或不存在".into(),
            )));
        }

        let token = create_jwt(&payload.address, &self.jwt_secret)
            .map_err(|e1| AuthError::Internal(e1.to_string()))?;
        Ok(token)
    }

    pub async fn sign_out(&self, token: &str) -> Result<()> {
        let token_data = decode_jwt(token, &self.jwt_secret)?;

        let now = Utc::now().timestamp() as u64;
        let exp = token_data.claims.exp as u64;
        let ttl = exp.saturating_sub(now);

        if ttl > 0 {
            let jti = format!("{}:{}", token_data.claims.sub, exp);
            blacklist_jwt(&self.redis_pool, &jti, ttl).await?
        }
        Ok(())
    }
}
