use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use anchor_client::anchor_lang::prelude::Pubkey;
use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use futures::stream::{SplitSink, SplitStream};
use log::{error, warn};
use tokio::select;
use tokio::sync::mpsc::Receiver;
use crate::chat::error::ChatError;
use crate::chat::types::{ChatMessage, ChatService, ClientCommand, MessageContent};

///发送任务,处理别人发送给"我"的

pub async fn start_write_task(
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

pub async fn start_read_task(
    mut stream:SplitStream<WebSocket>,
    chat_service:Arc<ChatService>,
    user_pubkey:Pubkey,
    last_active:Arc<AtomicU64>
){
    while let Some(Ok(msg)) = stream.next().await {
        //主要收到消息就更新.不管是pong还是
        last_active.store(
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
            Ordering::Relaxed
        );
        let chat_service_e=chat_service.clone();
        if let Message::Text(text) = msg {
            match serde_json::from_str::<ClientCommand>(&text){
                Ok(cmd)=>{
                    let _ =chat_service.handle_command(&user_pubkey, cmd).await;
                }
                Err(e)=>{
                    error!("反序列化 JSON 失败: {:?}. 原始消息: {}", e, text);
                    //TODO:这里反馈给用户(已做)
                    handle_protocol_error(chat_service_e,&user_pubkey,e).await;
                }
            }
        }
        //Pong不做处理
    }
}

///处理序列化失败给用户的回执
pub async fn handle_protocol_error(
    chat_service: Arc<ChatService>,
    user_pubkey:&Pubkey,
    e:serde_json::Error
){
    let chat_error=ChatError::SerializeError(e);
    let error_content=MessageContent::Error {
        code:400,
        message:format!("协议格式错误:{}",chat_error),
    };
    let _=chat_service.send_system_response(
        &user_pubkey,
        error_content
    ).await;
}