use crate::handlers::error::{HandlerResult, ok};
use crate::state::AppState;
use axum::Extension;
use axum::extract::State;
use serde_json::json;

pub mod book;
pub mod chat;
pub mod encryption;
pub mod error;
pub mod me;
pub mod transactions;
pub mod user;
//获取用户自己
pub async fn get_me(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
) -> HandlerResult {
    let now = chrono::Utc::now().timestamp();
    if let Some(user) = state.db_service.get_user(&pubkey).await? {
        return Ok(ok(json!({
            "pubkey":      user.pubkey,
            "username":    user.username,
            "avatar":      user.avatar,
            "enc_pubkey":  user.enc_pubkey,
            "trade_count": user.trade_count,
            "sell_count":  user.sell_count,
            "buy_count":   user.buy_count,
        })));
    }
    // 第一次登录，自动创建用户
    state.db_service.insert_user(&pubkey, now).await?;
    Ok(ok(json!({
        "pubkey":      pubkey,
        "username":    null,
        "avatar":      null,
        "enc_pubkey":  null,
        "trade_count": 0,
        "sell_count":  0,
        "buy_count":   0,
    })))
}
