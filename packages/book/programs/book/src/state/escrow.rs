use anchor_lang::prelude::*;
///托管结构
#[account]
#[derive(InitSpace)]
pub struct Escrow{
    pub seller:Pubkey,//卖家
    pub buyer:Pubkey,//买家
    pub asset:Pubkey,//关联的书的NFT
    /*
        最终成交价格
        Book部分记录原价,
        这里记录的最终价格可能是打折或者双方协商的价格
    */
    pub book:Pubkey,
    pub price:u64,
    pub state:EscrowState,//托管状态
    pub ship:Option<Ship>,
    pub dispute: Option<Dispute>,
    pub create_at:i64,//托管创建时间,也是购买时间
    pub bump:u8
}
///卖家发货
#[derive(Clone,InitSpace,AnchorSerialize,AnchorDeserialize)]
pub struct Ship{
    pub shipping_commitment:[u8;32],//发货的快递单号+哈希
    pub shipped_at:i64,//发货时间
}
///仲裁
#[derive(Clone,InitSpace,AnchorDeserialize,AnchorSerialize)]
pub struct Dispute{
    pub dispute_initiator:Pubkey,//仲裁发起者
    pub votes:[ArbVote;3],//3个dao评委
    pub arb_res:ArbitrationResult,//投票结果
    //如果买家胜利,裁决员决定是否返还部分买金作为补偿以及还是退书退款
    pub refund_amount:u64,
    pub return_book:bool,
}
///每个评委投票
#[derive(Clone,AnchorSerialize,AnchorDeserialize,InitSpace)]
pub struct ArbVote{
    pub arbitrator:Pubkey,
    pub vote:VoteChoice
}
///投票选项
#[derive(Clone,AnchorSerialize,AnchorDeserialize,PartialEq,InitSpace)]
pub enum VoteChoice{
    NotVoted,
    Buyer,
    Seller,
}
///最终仲裁结果
#[derive(Clone,InitSpace,AnchorSerialize,AnchorDeserialize,PartialEq)]
pub enum ArbitrationResult{
    Voting,
    SellerWin,
    BuyerWin,
}
///托管状态
#[derive(AnchorDeserialize,AnchorSerialize,Clone,PartialEq,InitSpace)]
pub enum EscrowState{
    Paid,//买家支付
    Shipped,//卖家发货,防止买家在快递过程中随便取消
    Released,//交易完成
    Cancelled,//已取消
    Disputed//进入仲裁
}

