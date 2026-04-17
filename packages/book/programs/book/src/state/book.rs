use anchor_lang::prelude::*;

///表示一本书的交易结构
#[account]
#[derive(InitSpace)]
pub struct Book {
    pub asset: Pubkey,  //NFT地址
    pub seller: Pubkey, //卖家
    pub price: u64,     //价格
    //0:上架中锁定中,1:已售卖,2:仲裁中
    pub status: BookStatus, //状态

    //目前cid大小上限为59,存64预留容错
    #[max_len(64)]
    pub metadata_cid: String,//IPFS的Json的cid
    pub metadata_hash: [u8; 32], //元数据hash防篡改
    pub bump: u8,
}

#[derive(Clone,AnchorSerialize,AnchorDeserialize,PartialEq,InitSpace)]
pub enum BookStatus {
    Listed,//上架中
    InEscrow,//托管中
    Sold,//已经售卖
    DeListed//已下架
}



