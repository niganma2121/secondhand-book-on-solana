use anchor_lang::prelude::*;
use crate::{Book, BookStatus};
use crate::constants::BOOK_SEED;
use crate::event::DelistBookEvent;
use crate::AppError;
#[derive(Accounts)]
pub struct DelistBook<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        mut,
        constraint=book.owner==owner.key() @ AppError::UnauthorizedSeller,
        close=owner,//退还租金
        constraint=book.status==BookStatus::Listed @ AppError::InvalidStatus ,
        seeds=[BOOK_SEED,book.asset.as_ref()],
        bump=book.bump
    )]
    pub book:Account<'info,Book>
}

pub fn delist_book(
    ctx:Context<DelistBook>,
)->Result<()>{
    let book=&mut ctx.accounts.book;
    book.status=BookStatus::DeListed;

    emit!(DelistBookEvent{
        book:ctx.accounts.book.key(),
        seller:ctx.accounts.owner.key()
    });
    Ok(())
}