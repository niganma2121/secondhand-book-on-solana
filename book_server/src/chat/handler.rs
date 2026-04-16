use std::collections::HashMap;
use std::str::FromStr;
use crate::state::AppState;
use axum::extract::ws::{ WebSocket};
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{ StreamExt};
use log::{ info};
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64,};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::select;
use tokio::sync::mpsc::{channel, };
use crate::chat::types::{ChatService, UserConnection, UserInfo};
use crate::chat::connection::{start_read_task, start_write_task};
///处理ws升级
pub async fn chat_handler(
    ws: WebSocketUpgrade,
    Query(params):Query<HashMap<String,String>>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // 从 url 取 ?pubkey=...
    let pubkey_str = params.get("pubkey").map(|s| s.as_str()).unwrap_or("11111111111111111111111111111111");

    // 尝试解析，解析失败就用系统默认占位符
    let user_pubkey = Pubkey::from_str(pubkey_str).expect("解析公钥失败");
    //TODO测试的pubkey记着修改,要对接用户的Pubkey
    let _test_pubkey = Pubkey::new_unique();
    let chat_service=state.chat_service.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, chat_service, user_pubkey))
}

pub async fn handle_socket(socket: WebSocket, state: Arc<ChatService>, user_pubkey: Pubkey) {
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
    state.dash_map.insert(user_pubkey, UserConnection { tx, derive_info });
    info!("用户:{}加入连接", user_pubkey);

    let read_state = state.clone();
    //接受任务,,处理客户端发送过来的消息
    let mut read_task = tokio::spawn(start_read_task(
        stream,
        read_state,
        user_pubkey,
        last_active_c
    ));
    let mut write_task = tokio::spawn(start_write_task(
        sink,rx,last_active
    ));
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

