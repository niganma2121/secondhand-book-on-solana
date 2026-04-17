use anchor_lang::prelude::*;
///托管结构
#[account]
pub struct Escrow{
    pub seller:Pubkey,//卖家
    pub buyer:Pubkey,//买家
    pub asset:Pubkey,//NFT
    pub price:u64,//价格
    pub state:EscrowState,//托管状态
    pub bump:u8
}

#[derive(AnchorDeserialize,AnchorSerialize,Clone,PartialEq)]
pub enum EscrowState{
    Created,//已创建,等待支付
    Paid,//买家支付
    Released,//交易完成
    Cancelled,//已取消
    Dispute//进入仲裁
}