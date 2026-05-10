pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod event;
pub mod utils;
use anchor_lang::prelude::*;

pub use constants::*;
pub use state::{book::*,escrow::*};
pub use error::*;
use instructions::{*};
pub use utils::*;
declare_id!("B6FGFq5WVExospwD6XE4RiPdtjLp6R5wFRMYQeVPQsfz");

#[program]
pub mod book {
    use super::*;

    /*Book部分*/
    pub fn create_book(ctx:Context<CreateBook>,price:u64,metadata_id:String,metadata_hash: [u8; 32])->Result<()>{
        instructions::create_book(ctx,price,metadata_id,metadata_hash)
    }
    pub fn update_book_price(ctx:Context<UpdateBookPrice>,new_price:u64)->Result<()>{
        instructions::update_book_price(ctx,new_price)
    }
    pub fn relist_book(
        ctx:Context<RelistBook>,
        new_price:u64,
        metadata_id:String,
        metadata_hash:[u8;32]
    )->Result<()>{
        instructions::relist_book(ctx,new_price,metadata_id,metadata_hash)
    }
    pub fn delist_book(ctx:Context<DelistBook>)->Result<()>{
        instructions::delist_book(ctx)
    }

    /*Escrow部分*/
    pub fn create_escrow(ctx:Context<CreateEscrow>)->Result<()>{
        instructions::create_escrow(ctx)
    }
    pub fn ship_book(ctx:Context<ShipBook>,shipping_commitment:[u8;32])->Result<()>{
        instructions::ship_book(ctx,shipping_commitment)
    }
    pub fn confirm_escrow(ctx:Context<ConfirmReceipt>)->Result<()>{
        instructions::confirm_receipt(ctx)
    }
    pub fn cancel_escrow(ctx:Context<CancelEscrow>)->Result<()>{
        instructions::cancel_escrow(ctx)
    }
    pub fn open_dispute(ctx:Context<OpenDispute>)->Result<()>{
        instructions::open_dispute(ctx)
    }
    pub fn resolve_dispute(
        ctx:Context<ResolveDispute>,
        choice:VoteChoice,
        refund_amount:u64,
        return_book:bool
    )->Result<()>{
        instructions::resolve_dispute(ctx,choice,refund_amount,return_book)
    }
}
