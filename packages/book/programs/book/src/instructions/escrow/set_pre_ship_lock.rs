use anchor_lang::prelude::*;
use crate::{AppError, Escrow, EscrowState, ESCROW_SEED};

/// 卖家在 Paid 状态下链上锁单：买家不可再执行取消托管；卖家仍可取消、发货。
#[derive(Accounts)]
pub struct SetPreShipLock<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut)]
    pub buyer: SystemAccount<'info>,
    #[account(
        mut,
        has_one = seller @ AppError::UnauthorizedSeller,
        has_one = buyer @ AppError::UnmatchedBuyer,
        constraint = escrow.state == EscrowState::Paid @ AppError::InvalidEscrowState,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), escrow.book.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub fn set_pre_ship_lock(ctx: Context<SetPreShipLock>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    if !escrow.pre_ship_locked {
        escrow.pre_ship_locked = true;
    }
    Ok(())
}
