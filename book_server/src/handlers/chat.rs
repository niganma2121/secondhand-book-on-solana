use crate::AppError;
use crate::auth::error::AuthError;
use crate::auth::util::{issue_ws_ticket, ws_ticket_ttl_secs};
use crate::chat::types::MessageContent;
use crate::handlers::me::PageQuery;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde_json::json;
use std::str::FromStr;
use anchor_client::anchor_lang::prelude::Pubkey;

/// POST /api/chat/ws-ticket — 用会话 JWT 换短期 WS 握手票据（浏览器连接前调用）。
pub(crate) async fn issue_ws_ticket_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
) -> Result<impl IntoResponse, AuthError> {
    let ticket = issue_ws_ticket(&state.auth_service.redis_pool, &pubkey).await?;
    Ok((
        StatusCode::OK,
        Json(json!({
            "ticket": ticket,
            "expires_in": ws_ticket_ttl_secs(),
        })),
    ))
}

/// GET /api/me/chat/conversations
pub(crate) async fn list_chat_conversations_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
) -> Result<impl IntoResponse, AppError> {
    let conversations = state.db_service.list_conversations(&pubkey).await?;
    Ok((StatusCode::OK, Json(json!({ "conversations": conversations }))))
}

/// GET /api/me/chat/:peer/messages
pub(crate) async fn list_chat_messages_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(peer): Path<String>,
    Query(q): Query<PageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let page = q.to_page();
    let messages = state
        .db_service
        .get_conversation(&pubkey, &peer, &page)
        .await?;
    let max_read_id = state
        .db_service
        .mark_conversation_read(&pubkey, &peer)
        .await?;
    if let Some(max_id) = max_read_id {
        if let (Ok(from_user), Ok(to_user)) = (Pubkey::from_str(&pubkey), Pubkey::from_str(&peer)) {
            let _ = state
                .chat_service
                .send_transient_message(
                    &from_user,
                    &to_user,
                    MessageContent::ReadReceipt {
                        message_id: max_id.to_string(),
                    },
                )
                .await;
        }
    }
    Ok((StatusCode::OK, Json(json!({ "messages": messages }))))
}

/// POST /api/me/chat/:peer/read
pub(crate) async fn mark_chat_conversation_read_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(peer): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let max_read_id = state
        .db_service
        .mark_conversation_read(&pubkey, &peer)
        .await?;
    if let Some(max_id) = max_read_id {
        if let (Ok(from_user), Ok(to_user)) = (Pubkey::from_str(&pubkey), Pubkey::from_str(&peer)) {
            let _ = state
                .chat_service
                .send_transient_message(
                    &from_user,
                    &to_user,
                    MessageContent::ReadReceipt {
                        message_id: max_id.to_string(),
                    },
                )
                .await;
        }
    }
    Ok((StatusCode::OK, Json(json!({ "msg": "ok" }))))
}
