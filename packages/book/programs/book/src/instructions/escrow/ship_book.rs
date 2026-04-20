use anchor_lang::prelude::*;
use crate::{Escrow, AppError, EscrowState, ESCROW_SEED, Ship};
use crate::event::BookShippedEvent;

#[derive(Accounts)]
pub struct ShipBook<'info>{
    #[account(mut)]
    pub seller:Signer<'info>,

    #[account(
        mut,
        has_one=seller @ AppError::UnauthorizedSeller,
        constraint=escrow.state==EscrowState::Paid @ AppError::InvalidStatus,
        seeds=[ESCROW_SEED,escrow.buyer.as_ref(),escrow.book.as_ref()],
        bump
    )]
    pub escrow:Account<'info,Escrow>,
}

pub fn ship_book(ctx:Context<ShipBook>,shipping_commitment:[u8;32])->Result<()>{
    let escrow=&mut ctx.accounts.escrow;

    let create_time=Clock::get()?.unix_timestamp;
    let ship=Ship{
        shipping_commitment,
        shipped_at:create_time
    };
    escrow.ship=Some(ship);

    //更新托管状态
    escrow.state=EscrowState::Shipped;
    emit!(BookShippedEvent{
        escrow:ctx.accounts.escrow.key(),
        seller:ctx.accounts.seller.key(),
        shipped_at:create_time
    });

    Ok(())
}