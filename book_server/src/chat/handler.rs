use crate::chat::connection::{start_read_task, start_write_task};
use crate::chat::error::ChatError;
use crate::chat::types::{ChatService, UserConnection, UserInfo};
use crate::db::DBService;
use crate::state::AppState;
use anchor_client::solana_sdk::pubkey::{ Pubkey};
use axum::Extension;
use axum::extract::ws::WebSocket;
use axum::extract::{State, WebSocketUpgrade};
use axum::response::{IntoResponse, Response};
use futures::StreamExt;
use std::str::FromStr;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use std::time::{SystemTime, UNIX_EPOCH};
use sonyflake::Sonyflake;
use tokio::select;
use tokio::sync::mpsc::channel;
use tracing::info;

///处理ws
pub async fn chat_handler(
    ws: WebSocketUpgrade,
    Extension(pubkey): Extension<String>,
    State(state): State<AppState>,
) -> Response {
    let user_pubkey = match Pubkey::from_str(&pubkey) {
        Ok(p) => p,
        Err(e) =>return ChatError::PubkeyParseError(e.to_string()).into_response()
    };
    let chat_service = state.chat_service.clone();
    let db = state.db_service.clone();
    let id_generator=state.id_generator.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, chat_service, db, id_generator,user_pubkey))
}

pub async fn handle_socket(
    socket: WebSocket,
    state: Arc<ChatService>,
    db: DBService,
    id_generator:Arc<Sonyflake>,
    user_pubkey: Pubkey,
) {
    //心跳计时时间
    let last_active = Arc::new(AtomicU64::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    ));
    let last_active_c = last_active.clone();
    //拆分发送和接受
    let (sink, stream) = socket.split();
    let (tx, rx) = channel(100);
    let derive_info = UserInfo::new(user_pubkey, None, None);
    state
        .dash_map
        .insert(user_pubkey, UserConnection { tx, derive_info });
    info!("用户:{}加入连接", user_pubkey);

    let read_state = state.clone();
    //接受任务,,处理客户端发送过来的消息
    let mut read_task = tokio::spawn(start_read_task(
        stream,
        read_state,
        db,
        id_generator,
        user_pubkey,
        last_active_c,
    ));
    let mut write_task = tokio::spawn(start_write_task(sink, rx, last_active));
    info!("用户{}调度任务完成", user_pubkey);
    select! {
        res=&mut read_task=>info!("读取流断开:{:?}",res),
        res = &mut write_task => info!("写入流断开: {:?}", res),
    }
    read_task.abort();
    write_task.abort();
    state.dash_map.remove(&user_pubkey);
    info!("用户{}断开连接,回收资源", user_pubkey)
}
