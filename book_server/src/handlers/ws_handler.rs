use std::collections::HashMap;
use std::str::FromStr;
use crate::services::ChatService;
use crate::state::AppState;
use crate::types::chat::{ChatMessage, ClientCommand, MessageContent, UserConnection, UserInfo};
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use log::{error, info, warn};
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use futures::stream::{SplitSink, SplitStream};
use tokio::select;
use tokio::sync::mpsc::{channel, Receiver};
use crate::error::ChatError;

///处理ws升级
pub async fn chat_handler(
    ws: WebSocketUpgrade,
    Query(params):Query<HashMap<String,String>>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // 从 url 取 ?pubkey=xxxx
    let pubkey_str = params.get("pubkey").map(|s| s.as_str()).unwrap_or("11111111111111111111111111111111");

    // 尝试解析，解析失败就用系统默认占位符
    let user_pubkey = Pubkey::from_str(pubkey_str).expect("解析公钥失败");
    //TODO测试的pubkey记着修改,要对接用户的Pubkey
    let test_pubkey = Pubkey::new_unique();
    ws.on_upgrade(move |socket| handle_socket(socket, state, user_pubkey))
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

///发送任务,处理别人发送给"我"的

async fn start_write_task(
    mut sink:SplitSink<WebSocket,Message>,
    mut rx:Receiver<ChatMessage>,
    last_active:Arc<AtomicU64>
){
    let mut ticker = tokio::time::interval(Duration::from_secs(15));
    loop {
        select! {
                Some(chat_msg)=rx.recv()=>{
                    if let Ok(json)=serde_json::to_string(&chat_msg){
                        if sink.send(json.into()).await.is_err(){
                            break;
                        }
                    }else{
                        error!("序列化失败");

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
}

async fn start_read_task(
    mut stream:SplitStream<WebSocket>,
    state:AppState,
    user_pubkey:Pubkey,
    last_active:Arc<AtomicU64>
){
    while let Some(Ok(msg)) = stream.next().await {
        //主要收到消息就更新.不管是pong还是
        last_active.store(
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
            Ordering::Relaxed
        );
        if let Message::Text(text) = msg {
            match serde_json::from_str::<ClientCommand>(&text){
                Ok(cmd)=>{
                    let _ = ChatService::handle_command(&state, &user_pubkey, cmd).await;
                }
                Err(e)=>{
                    error!("反序列化 JSON 失败: {:?}. 原始消息: {}", e, text);
                    //TODO:这里反馈给用户(已做)
                    handle_protocol_error(&state,&user_pubkey,e).await;
                }
            }
        }
        //Pong不做处理
    }
}

///处理序列化失败给用户的回执
async fn handle_protocol_error(
    state:&AppState,
    user_pubkey:&Pubkey,
    e:serde_json::Error
){
    let chat_error=ChatError::SerializeError(e);
    let error_content=MessageContent::Error {
        code:400,
        message:format!("协议格式错误:{}",chat_error),
    };
    let _=ChatService::send_system_response(
        &state,
        &user_pubkey,
        error_content
    ).await;
}