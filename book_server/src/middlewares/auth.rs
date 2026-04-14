use std::sync::Arc;
use axum::extract::State;
use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;
use axum::http::header;
use axum::http::header::AUTHORIZATION;
use crate::error::AuthError;
use crate::state::AppState;
use crate::utils::auth_utils::decode_jwt;

pub async fn auth_middleware(
    State(state):State<Arc<AppState>>,
    mut req:Request,
    next:Next
) ->Result<Response,AuthError>{
    let auth_header=req.headers()
        .get(AUTHORIZATION)
        .and_then(|t|t.to_str().ok())
        .ok_or_else(||AuthError::Unauthorized("未认证".into()))?;

    if !auth_header.starts_with("Bearer "){
        return Err(AuthError::Unauthorized("无效的token格式".into()))
    }

    let token=&auth_header[7..];

    //验证token
    let token=decode_jwt(token,state.get_jwt())
        .map_err(|_| AuthError::Unauthorized("无效或过期的令牌".into()))?;

    req.extensions_mut().insert(token.claims.sub);
    Ok(next.run(req).await)
}