use anchor_lang::prelude::*;
use crate::Book;
use crate::constants::BOOK_SEED;
use crate::event::UpdatePriceEvent;
use crate::BookStatus;
use crate::AppError;
#[derive(Accounts)]
pub struct UpdateBookPrice<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        mut,
        constraint=book.owner==owner.key() @ AppError::UnauthorizedSeller,
        constraint=book.status==BookStatus::Listed @ AppError::InvalidStatus,
        seeds=[BOOK_SEED,book.asset.as_ref()],
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
        seller:ctx.accounts.owner.key(),
        old_price,
        new_price
    });
    Ok(())
}