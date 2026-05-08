use anchor_lang::prelude::*;
use crate::{AppError, Book, BookStatus, BOOK_SEED};
use crate::event::UpdateMetadataEvent;

#[derive(Accounts)]
pub struct UpdateBookMetadata<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        mut,
        constraint=book.owner==owner.key() @ AppError::UnauthorizedSeller,
        constraint=book.status!=BookStatus::InEscrow @ AppError::InvalidStatus,
        seeds=[BOOK_SEED,book.asset.as_ref()],
        bump=book.bump
    )]
    pub book:Account<'info,Book>
}

pub fn update_book_metadata(
    ctx:Context<UpdateBookMetadata>,
    metadata_cid:String,
    metadata_hash:[u8;32]
)->Result<()>{
    let book=&mut ctx.accounts.book;
    book.metadata_cid=metadata_cid;
    book.metadata_hash=metadata_hash;

    emit!(UpdateMetadataEvent{
        book:book.key(),
        owner:ctx.accounts.owner.key(),
    });
    Ok(())
}
