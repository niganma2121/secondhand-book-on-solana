use crate::handlers::error::{HandlerResult, bad_request, ok};
use crate::state::AppState;
use axum::Extension;
use axum::extract::State;
use serde_json::json;

pub mod book;
pub mod chat;
pub mod encryption;
pub mod error;
pub mod me;
pub mod stats;
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
            "reputation_score": user.reputation_score,
            "dispute_total": user.dispute_total,
            "dispute_won": user.dispute_won,
            "dispute_lost": user.dispute_lost,
            "username_changes_remaining_today": user.username_changes_remaining_today(),
        })));
    }
    // 第一次登录，自动创建用户
    state.db_service.insert_user(&pubkey, now).await?;
    let user = state
        .db_service
        .get_user(&pubkey)
        .await?
        .ok_or_else(|| bad_request("用户创建失败，请稍后重试"))?;
    Ok(ok(json!({
        "pubkey":      user.pubkey,
        "username":    user.username,
        "avatar":      user.avatar,
        "enc_pubkey":  user.enc_pubkey,
        "trade_count": user.trade_count,
        "sell_count":  user.sell_count,
        "buy_count":   user.buy_count,
        "reputation_score": user.reputation_score,
        "dispute_total": user.dispute_total,
        "dispute_won": user.dispute_won,
        "dispute_lost": user.dispute_lost,
        "username_changes_remaining_today": user.username_changes_remaining_today(),
    })))
}
