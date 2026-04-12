
use std::time::{SystemTime, UNIX_EPOCH};
use anchor_client::anchor_lang::prelude::Pubkey;
use log::{error, info};
use crate::state::AppState;
use crate::types::chat::{ChatMessage, ClientCommand, SyncRequest};
use super::ChatService;
use anyhow::Result;
use solana_sdk::signature::Signer;
use crate::error::ChatError;
use crate::types::chat::MessageContent::Delivered;

impl ChatService{
    //一对一转发
    pub async fn handle_command(
        state:&AppState,
        sender_pubkey:&Pubkey,
        command:ClientCommand
    )->Result<()>{
        match command{
            ClientCommand::Sync(req) => {
                Self::handle_sync(state,sender_pubkey,req).await?
            }
            ClientCommand::SendMessage(msg) => {
                Self::send_message(state,sender_pubkey,msg).await?
            }
        }
        Ok(())
    }

    ///处理消息发送问题
    async fn send_message(
        state:&AppState,
        sender_pubkey:&Pubkey,
        mut msg:ChatMessage
    )->Result<()>{
        msg.from=*sender_pubkey;

        //生成唯一ID
        //TODO:提取错误类型
        let msg_id=state.id_generator.next_id().map_err(|e1| {
           ChatError::IdGeneratorError(e1.to_string())
        })?;
        msg.id=msg_id;
        msg.timestamp=SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e2| {
                ChatError::SystemError(e2)
            })?
            .as_millis() as i64;

        //TODO:持久化写入数据库中

        //实时分发
        let target_pubkey=&msg.to;
        if let Some(connection)=state.dash_map.get(target_pubkey){
            if let Err(e)=connection.tx.send(msg.clone()).await{
                error!("消息推送至用户 {} 的 Channel 失败: {}", target_pubkey, e);
            }
        }else{
            info!("用户{}不在线,已经离线存储",target_pubkey);
        }
        //给发送者发送一个发送回执
        Self::send_ack(state,sender_pubkey,msg_id).await?;

        Ok(())
    }

    //处理用户信息同步
    async fn handle_sync(
        state:&AppState,
        user_pubkey:&Pubkey,
        req:SyncRequest
    )->Result<()>{
        todo!()
    }

    //发送ack回执
    async fn send_ack(state:&AppState,to_user:&Pubkey,original_msg_id:u64)->Result<()>{
        if let Some(connection)=state.dash_map.get(&to_user){
            let ack_msg=ChatMessage::new(
                0,//不需要存储该回执消息
                state.get_admin_keypair().pubkey(),
                *to_user,
                0,
                Delivered {
                    message:original_msg_id.to_string()//已送达的消息的id,用于客户端区分
                }
            );
            let _=connection.tx.send(ack_msg).await;
        }
        Ok(())
    }
}