use std::sync::Arc;
use axum::extract::State;
use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;
use crate::auth::error::AuthError;
use crate::auth::util::{decode_jwt, is_jwt_blacklist};
use crate::state::AppState;
use axum_extra::extract::CookieJar;
use tracing::info;
pub async fn auth_middleware(
    State(state):State<AppState>,
    jar:CookieJar,
    mut req:Request,
    next:Next
) ->Result<Response,AuthError>{
    let token=jar
        .get("jwt-token")
        .map(|t1| {t1.value()})
        .ok_or_else(||AuthError::Unauthorized("未认证,请登陆".into()))?;

    //验证token
    let token_data=decode_jwt(token,&state.auth_service.jwt_secret)
        .map_err(|_| AuthError::Unauthorized("无效或过期的令牌".into()))?;

    let jti=format!("{}:{}",token_data.claims.sub,token_data.claims.exp);
    if is_jwt_blacklist(&state.auth_service.redis_pool,&jti).await?{
        return Err(AuthError::Unauthorized("令牌已失效，请重新登录".into()));
    }
    info!("检查黑名单 jti: {}", jti);

    req.extensions_mut().insert(token_data.claims.sub);
    Ok(next.run(req).await)
}