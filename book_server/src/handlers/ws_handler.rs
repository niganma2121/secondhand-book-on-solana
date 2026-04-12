use crate::services::ChatService;
use crate::state::AppState;
use crate::types::chat::{ClientCommand, UserConnection, UserInfo};
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use log::{info, warn};
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::select;
use tokio::sync::mpsc::channel;

///处理ws升级
pub async fn chat_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    //测试的pubkey
    let test_pubkey = Pubkey::new_unique();
    ws.on_upgrade(move |socket| handle_socket(socket, state, test_pubkey))
}

pub async fn handle_socket(socket: WebSocket, state: AppState, user_pubkey: Pubkey) {
    let last_active = Arc::new(AtomicU64::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    ));
    let last_active_c = last_active.clone();
    //拆分发送和接受
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = channel(100);
    let derive_info = UserInfo::new(user_pubkey, None, None);
    state
        .dash_map
        .insert(user_pubkey, UserConnection { tx, derive_info });
    info!("用户:{}加入连接", user_pubkey);

    let read_state = state.clone();
    //接受任务,,处理客户端发送过来的消息
    let mut read_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            //主要收到消息就更新.不管是pong还是
            last_active_c.store(
                SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
                Ordering::Relaxed
            );
            if let Message::Text(text) = msg {
                if let Ok(cmd) = serde_json::from_str::<ClientCommand>(&text) {
                    let _ = ChatService::handle_command(&read_state, &user_pubkey, cmd).await;
                }
            }
            //Pong不做处理
        }
    });
    //发送任务,处理别人发送给"我"的
    let mut write_task = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(15));
        loop {
            select! {
                Some(chat_msg)=rx.recv()=>{
                    if let Ok(json)=serde_json::to_string(&chat_msg){
                        if sink.send(json.into()).await.is_err(){break;}
                    }
                }
                _=ticker.tick()=>{
                    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
                    if now-last_active.load(Ordering::Relaxed)>15*3{
                        warn!("用户心跳超时,连接将关闭");
                        break;
                    }
                    //发送给客户端Ping
                    if sink.send(Message::Ping(vec![].into())).await.is_err(){break;}
                }
            }
        }
    });
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
