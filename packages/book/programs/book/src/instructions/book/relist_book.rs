use anchor_lang::prelude::*;
use crate::{AppError, Book, BookStatus, BOOK_SEED};
use crate::event::RelistBookEvent;

#[derive(Accounts)]
pub struct RelistBook<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        mut,
        constraint=book.owner==owner.key() @ AppError::UnauthorizedSeller,
        constraint=book.status==BookStatus::Sold @ AppError::InvalidStatus,
        seeds=[BOOK_SEED,book.asset.as_ref()],
        bump=book.bump
    )]
    pub book:Account<'info,Book>
}

pub fn relist_book(
    ctx:Context<RelistBook>,
    new_price:u64,
    metadata_cid:String,
    metadata_hash:[u8;32]
)->Result<()>{
    require!(new_price > 0, AppError::InvalidPrice);
    let normalized_cid = metadata_cid.trim();
    require!(!normalized_cid.is_empty(), AppError::EmptyMetadataCid);
    // 与 Book 账户里#[max_len(64)]保持一致
    require!(normalized_cid.as_bytes().len() <= 64, AppError::MetadataCidTooLong);

    let book=&mut ctx.accounts.book;
    book.seller=ctx.accounts.owner.key();
    book.price=new_price;
    book.metadata_cid=normalized_cid.to_string();
    book.metadata_hash=metadata_hash;
    book.status=BookStatus::Listed;

    emit!(RelistBookEvent{
        book:book.key(),
        owner:ctx.accounts.owner.key(),
        new_price
    });
    Ok(())
}
