use anchor_lang::prelude::*;
use crate::Book;
use crate::constants::BOOK_SEED;
use crate::event::UpdatePriceEvent;
use crate::BookStatus;
use crate::AppError;
#[derive(Accounts)]
pub struct UpdateBookPrice<'info>{
    #[account(mut)]
    pub seller:Signer<'info>,

    #[account(
        mut,
        has_one=seller,
        constraint=book.status==BookStatus::Listed @ AppError::InvalidStatus,
        seeds=[BOOK_SEED,seller.key().as_ref(),book.asset.key().as_ref()],
        bump=book.bump
    )]
    pub book:Account<'info,Book>
}

pub fn update_book_price(
    ctx:Context<UpdateBookPrice>,
    new_price:u64
)->Result<()>{
    let old_price=ctx.accounts.book.price;
    let book=&mut ctx.accounts.book;
    book.price=new_price;
    
    emit!(UpdatePriceEvent{
        book:ctx.accounts.book.key(),
        seller:ctx.accounts.seller.key(),
        old_price,
        new_price
    });
    Ok(())
}