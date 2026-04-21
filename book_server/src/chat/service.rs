use std::time::{ SystemTime, UNIX_EPOCH};
use anchor_client::anchor_lang::prelude::Pubkey;
use log::{error, info};
use anyhow::Result;
use crate::chat::error::ChatError;
use crate::chat::types::{ChatMessage, ChatService, ClientCommand, MessageContent, SyncRequest};
use crate::chat::types::MessageContent::Delivered;

impl ChatService{
    
    //一对一转发
    pub async fn handle_command(
        &self,
        sender_pubkey:&Pubkey,
        command:ClientCommand
    )->Result<()>{
        match command{
            ClientCommand::Sync(req) => {
                self.handle_sync(sender_pubkey,req).await?
            }
            ClientCommand::SendMessage(msg) => {
                self.send_message(sender_pubkey,msg).await?
            }
        }
        Ok(())
    }

    ///处理消息发送问题
    async fn send_message(
        &self,
        sender_pubkey:&Pubkey,
        mut msg:ChatMessage
    )->Result<()>{
        msg.from=*sender_pubkey;

        //生成唯一ID
        let msg_id=self.id_generator.next_id().map_err(|e1| {
            ChatError::IdGeneratorError(e1.to_string())
        })?;
        msg.id=msg_id;
        msg.timestamp=SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e2| {
                ChatError::SystemError(e2)
            })?
            .as_secs() as i64;

        //TODO:持久化写入数据库中

        //给发送者发送一个已发送回执
        let response=Delivered {
            message:msg_id.to_string()
        };
        self.send_system_response(sender_pubkey,response).await?;
        //实时分发
        let target_pubkey=&msg.to;
        if let Some(connection)=self.dash_map.get(target_pubkey){
            if let Err(e)=connection.tx.send(msg.clone()).await{
                error!("消息推送至用户 {} 的 Channel 失败: {}", target_pubkey, e);
                //上面已经存数据库,不用管,等用户上线拉取即可

                // 清理持有的读锁,避免死锁的问题
                drop(connection);
                self.dash_map.remove(target_pubkey);
            }
        }else{
            info!("用户{}不在线,已经离线存储",target_pubkey);
        }
        Ok(())
    }

    //处理用户信息同步
    async fn handle_sync(
        &self,
        user_pubkey:&Pubkey,
        req:SyncRequest
    )->Result<()>{
        todo!()
    }

    //发送ack回执
    pub async fn send_system_response(
        &self,
        to_user:&Pubkey,
        content:MessageContent
    )->Result<()>{
        if let Some(connection)=self.dash_map.get(&to_user){
            let system_msg=ChatMessage::new(
                0,
                self.get_admin_key(),
                *to_user,
                SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as i64,
                content
            );
            if let Err(e)=connection.tx.send(system_msg).await{
                error!("无法向用户:{},推送系统信息可能已经离线:{e}",to_user)
                //TODO:先存入数据库,然后告诉用户上线后告诉用户再渲染
            }
        }
        Ok(())
    }
}