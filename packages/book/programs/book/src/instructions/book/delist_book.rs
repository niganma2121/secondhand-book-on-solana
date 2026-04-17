use anchor_lang::prelude::*;
use crate::{Book, BookStatus};
use crate::constants::BOOK_SEED;
use crate::event::DelistBookEvent;

#[derive(Accounts)]
pub struct DelistBook<'info>{
    #[account(mut)]
    pub seller:Signer<'info>,

    #[account(
        mut,
        has_one=seller,
        close=seller,//退还租金
        seeds=[BOOK_SEED,seller.key().as_ref(),book.asset.key().as_ref()],
        bump=book.bump
    )]
    pub book:Account<'info,Book>
}

pub fn delist_book(
    ctx:Context<DelistBook>,
)->Result<()>{
    let book=&mut ctx.accounts.book;
    book.status=BookStatus::DeListed;

    emit!(DelistBookEvent{});
    Ok(())
}