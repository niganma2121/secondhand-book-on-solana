use anchor_lang::prelude::*;
use crate::{Book, BookStatus};
use crate::constants::BOOK_SEED;
use crate::event::CreateEvent;
use crate::error::AppError;
#[derive(Accounts)]
#[instruction(price:u64)]
pub struct CreateBook<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer=seller,
        space=8+Book::INIT_SPACE,
        seeds=[BOOK_SEED,seller.key().as_ref(),asset.key().as_ref()],
        bump,
        constraint=price>0 @ AppError::InvalidPrice
    )]
    pub book: Account<'info, Book>,
    ///CHECK:MPL-Core NFT地址
    pub asset: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,

}

pub fn create_book(
    ctx:Context<CreateBook>,
    price:u64,
    metadata_cid:String ,
    metadata_hash:[u8;32],
)->Result<()>{
    let book=&mut ctx.accounts.book;

    book.seller=ctx.accounts.seller.key();
    book.asset=ctx.accounts.asset.key();
    book.price=price;
    book.status=BookStatus::Listed;
    book.metadata_cid=metadata_cid;
    book.metadata_hash=metadata_hash;

    book.bump=ctx.bumps.book;

    emit!(CreateEvent{
        book:ctx.accounts.book.key(),
        seller:ctx.accounts.seller.key(),
        asset:ctx.accounts.asset.key(),
        price
    });
    Ok(())
}