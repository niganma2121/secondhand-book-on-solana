use std::str::FromStr;
use crate::chat::error::ChatError;
use crate::chat::types::{ChatMessage, ChatService, ClientCommand, MessageContent, SyncRequest};
use anchor_client::anchor_lang::prelude::Pubkey;
use anyhow::Result;
use std::time::{SystemTime, UNIX_EPOCH};
use sonyflake::Sonyflake;
use tracing::{error, info};
use crate::db::DBService;

impl ChatService {
    //一对一转发
    pub async fn handle_command(
        &self,
        sender_pubkey: &Pubkey,
        command: ClientCommand,
        db:&DBService,
        id_generator:&Sonyflake
    ) -> Result<()> {
        match command {
            ClientCommand::Sync(req) => self.handle_sync(sender_pubkey, req,&db).await?,
            ClientCommand::SendMessage(msg) => {
                let msg_id = id_generator.next_id()
                    .map_err(|e| ChatError::IdGeneratorError(e.to_string()))?;
                self.send_message(sender_pubkey, msg, db, msg_id).await?;
            }
        }
        Ok(())
    }

    ///处理消息发送问题
    async fn send_message(&self, sender_pubkey: &Pubkey, mut msg: ChatMessage,db:&DBService,msg_id:u64) -> Result<()> {
        if msg.to == *sender_pubkey {
            anyhow::bail!("不能向自己的地址发消息");
        }
        msg.from = *sender_pubkey;
        msg.id = msg_id;
        msg.timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e2| ChatError::SystemError(e2))?
            .as_secs() as i64;

        //持久化
        let content=serde_json::to_value(&msg.content).map_err(
            |e|ChatError::SerializeError(e)
        )?;
        db.insert_message(
            msg_id as i64,
            &msg.from.to_string(),
            &msg.to.to_string(),
            &content,
            msg.timestamp
        ).await?;

        //给发送者发送一个已发送回执
        self.send_system_response(sender_pubkey,  MessageContent::Delivered {
            message: msg_id.to_string(),
        }).await?;
        //实时分发
        let target_pubkey = &msg.to;
        if let Some(connection) = self.dash_map.get(target_pubkey) {
            if let Err(e) = connection.tx.send(msg.clone()).await {
                error!("消息推送至用户 {} 的 Channel 失败: {}", target_pubkey, e);
                //上面已经存数据库,不用管,等用户上线拉取即可

                // 清理持有的读锁,避免死锁的问题
                drop(connection);
                self.dash_map.remove(target_pubkey);
            }
        } else {
            info!("用户{}不在线,已经离线存储", target_pubkey);
        }
        Ok(())
    }

    //处理用户信息同步
    async fn handle_sync(&self, user_pubkey: &Pubkey, req: SyncRequest,db:&DBService) -> Result<()> {
        let pubkey_str=user_pubkey.to_string();
        //拉去消息
        let msgs=db.get_offline_messages(
            &pubkey_str,
            req.last_id as i64
        ).await?;
        if msgs.is_empty(){
            return Ok(())
        }
        for row in msgs{
            let content=serde_json::from_value(row.content)
                .map_err(|e|ChatError::SerializeError(e))?;
            let chat_msg=ChatMessage::new(
                row.id as u64,
                Pubkey::from_str(&row.from_pubkey)?,
                Pubkey::from_str(&row.to_pubkey)?,
                row.timestamp,
                content
            );
            self.send_system_response(user_pubkey,MessageContent::Delivered {
                message:row.id.to_string()
            }).await?;
            if let Some(conn)=self.dash_map.get(user_pubkey){
                let _=conn.tx.send(chat_msg).await;
            }
        }
        //未读数量
        let unread = db.count_unread(&pubkey_str).await?;
        self.send_system_response(user_pubkey, MessageContent::System {
            level: crate::chat::types::SystemLevel::Info,
        }).await?;
        info!("用户{}同步完成，未读消息数:{}", user_pubkey, unread);

        Ok(())
    }

    //发送ack回执
    pub async fn send_system_response(
        &self,
        to_user: &Pubkey,
        content: MessageContent,
    ) -> Result<()> {
        if let Some(connection) = self.dash_map.get(&to_user) {
            let system_msg = ChatMessage::new(
                0,
                self.get_admin_key(),
                *to_user,
                SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as i64,
                content,
            );
            if let Err(e) = connection.tx.send(system_msg).await {
                error!("无法向用户:{},推送系统信息可能已经离线:{e}", to_user)
                //TODO:先存入数据库,然后告诉用户上线后告诉用户再渲染
            }
        }
        Ok(())
    }
}
