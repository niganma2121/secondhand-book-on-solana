
use anchor_lang::prelude::*;


///表示一本书的交易结构
#[account]
pub struct Book{
    pub seller:Pubkey,//卖家
    pub asset:Pubkey,//NFT地址
    pub price:u64,//价格
    //0:上架中锁定中,1:已售卖,2:仲裁中
    pub status:BookStatus,//状态

    pub metadata_cid:String,
    pub metadata_hash:[u8;32],//元数据hash防篡改
    bump:u8
}

#[derive(Clone)]
pub enum BookStatus{

}