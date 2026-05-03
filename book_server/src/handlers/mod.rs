use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde_json::json;

pub mod book;
pub mod chat;
pub mod google_books;
pub mod me;
pub mod user;
pub mod error;
//获取用户自己
pub async fn get_me(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
) -> impl IntoResponse {
    let now = chrono::Utc::now().timestamp();
    match state.db_service.get_user(&pubkey).await {
        Ok(Some(user)) => (
            StatusCode::OK,
            Json(json!({
                "pubkey":      user.pubkey,
                "username":    user.username,
                "avatar":      user.avatar,
                "trade_count": user.trade_count,
                "sell_count":  user.sell_count,
                "buy_count":   user.buy_count,
            })),
        )
            .into_response(),
        Ok(None) => {
            // 第一次登录，自动创建用户
            if let Err(e) = state.db_service.insert_user(&pubkey, now).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
            (
                StatusCode::OK,
                Json(json!({
                    "pubkey":      pubkey,
                    "username":    null,
                    "avatar":      null,
                    "trade_count": 0,
                    "sell_count":  0,
                    "buy_count":   0,
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ).into_response(),
    }
}
