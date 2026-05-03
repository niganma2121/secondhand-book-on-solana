use axum::extract::State;
use axum::extract::Request;
use axum::http::header::AUTHORIZATION;
use axum::middleware::Next;
use axum::response::Response;
use crate::auth::error::AuthError;
use crate::auth::util::{consume_ws_ticket, decode_jwt, is_jwt_blacklist};
use crate::state::AppState;
use axum_extra::extract::CookieJar;
use tracing::info;

fn bearer_token_from_headers(req: &Request) -> Option<&str> {
    req.headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(str::trim)
}

/// 浏览器 WS 握手用 `?ticket=`（短期一次性，见 `issue_ws_ticket`）。
fn ticket_from_ws_query(uri: &axum::http::Uri) -> Option<String> {
    let q = uri.query()?;
    let mut base = reqwest::Url::parse("http://placeholder.invalid").ok()?;
    base.set_query(Some(q));
    base.query_pairs()
        .find(|(k, _)| k == "ticket")
        .map(|(_, v)| v.into_owned())
}

fn is_chat_ws_path(path: &str) -> bool {
    path.ends_with("/chat/ws")
}

/// Cookie `jwt-token` 或 `Authorization: Bearer`。
/// 聊天 WebSocket：优先 `GET .../chat/ws?ticket=<一次性票据>`；否则仍可按 Cookie/Bearer 校验 JWT（原生客户端等）。
pub async fn auth_middleware(
    State(state): State<AppState>,
    jar: CookieJar,
    mut req: Request,
    next: Next,
) -> Result<Response, AuthError> {
    let uri = req.uri().clone();
    let path = uri.path();

    if is_chat_ws_path(path) {
        if let Some(ticket) = ticket_from_ws_query(&uri) {
            let pubkey = consume_ws_ticket(&state.auth_service.redis_pool, &ticket).await?;
            return match pubkey {
                Some(pk) => {
                    req.extensions_mut().insert(pk);
                    Ok(next.run(req).await)
                }
                None => Err(AuthError::Unauthorized(
                    "无效或已过期的握手票据".into(),
                )),
            };
        }
    }

    let token: String = jar
        .get("jwt-token")
        .map(|c| c.value().to_string())
        .or_else(|| bearer_token_from_headers(&req).map(str::to_string))
        .ok_or_else(|| AuthError::Unauthorized("未认证,请登陆".into()))?;

    let token_data = decode_jwt(&token, &state.auth_service.jwt_secret)
        .map_err(|_| AuthError::Unauthorized("无效或过期的令牌".into()))?;

    let jti = format!("{}:{}", token_data.claims.sub, token_data.claims.exp);
    if is_jwt_blacklist(&state.auth_service.redis_pool, &jti).await? {
        return Err(AuthError::Unauthorized("令牌已失效，请重新登录".into()));
    }
    info!("检查黑名单 jti: {}", jti);

    req.extensions_mut().insert(token_data.claims.sub);
    Ok(next.run(req).await)
}
