use anchor_lang::prelude::*;
use crate::ArbitrationResult;
/*----Book部分-----*/
#[event]
pub struct CreateEvent{
    pub book:Pubkey,
    pub seller:Pubkey,
    pub asset:Pubkey,
    pub price:u64
}

#[event]
pub struct UpdatePriceEvent{
    pub book: Pubkey,
    pub seller: Pubkey,
    pub old_price: u64,
    pub new_price: u64,
}

#[event]
pub struct DelistBookEvent{
    pub book: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct RelistBookEvent{
    pub book: Pubkey,
    pub owner: Pubkey,
    pub new_price: u64,
}


/*Escrow部分*/
#[event]
pub struct EscrowCreateEvent{
    pub escrow: Pubkey,
    pub book: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct BookShippedEvent {
    pub escrow: Pubkey,
    pub seller: Pubkey,
    pub shipped_at: i64,
}

#[event]
pub struct ReceiptConfirmedEvent {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}
#[event]
pub struct EscrowCancelledEvent {
    pub escrow: Pubkey,
    pub cancelled_by: Pubkey, // 买家还是卖家取消的
    pub buyer: Pubkey,
    pub price: u64,           // 退款金额
}

#[event]
pub struct DisputeOpenedEvent {
    pub escrow: Pubkey,
    pub initiator: Pubkey,//发起人
    pub buyer: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct DisputeResolvedEvent {
    pub escrow: Pubkey,
    pub result: ArbitrationResult,
    pub refund_amount: u64,
    pub return_book: bool,
}