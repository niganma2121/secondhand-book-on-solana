use anchor_lang::prelude::*;
use crate::{nft_to_seller, BookStatus, Escrow};
use crate::Book;
use crate::{AppError,EscrowState,ESCROW_SEED,BOOK_SEED};
use crate::event::EscrowCancelledEvent;

#[derive(Accounts)]
pub struct CancelEscrow<'info>{
    #[account(mut)]
    pub signer:Signer<'info>,
    #[account(mut)]
    pub buyer:SystemAccount<'info>,
    #[account(
        mut,
        has_one=buyer @ AppError::UnmatchedBuyer,
        constraint=(
            escrow.buyer==signer.key()||
            escrow.seller==signer.key()
        ) @ AppError::UnauthorizedBuyerOrSeller,
        constraint=escrow.state==EscrowState::Paid,//只有支付后且运输前可以取消
        seeds=[ESCROW_SEED,buyer.key().as_ref(),escrow.book.as_ref()],
        bump=escrow.bump,
        close=buyer
    )]
    pub escrow:Account<'info,Escrow>,
    #[account(
        mut,
        seeds=[BOOK_SEED,escrow.asset.as_ref()],
        bump=book.bump
    )]
    pub book:Account<'info,Book>,
    #[account(
        mut,
        constraint=asset.key()==book.asset @AppError::InvalidAsset,
    )]
    ///CHECK:NFT地址
    pub asset:UncheckedAccount<'info>,
    #[account(mut)]
    ///CHECK:关联的系列
    pub collection:UncheckedAccount<'info>,
    #[account(address=mpl_core::ID)]
    ///CHECK:MPL Core
    pub mpl_core_program:UncheckedAccount<'info>,
    pub system_program:Program<'info,System>
}

pub fn cancel_escrow(ctx:Context<CancelEscrow>)->Result<()>{
    let book_seeds:&[&[u8]]=&[
        BOOK_SEED,
        ctx.accounts.book.asset.as_ref(),
        &[ctx.accounts.book.bump]
    ];
    let book_signer_seeds=&[book_seeds];

    //解冻NFT
    nft_to_seller(
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.asset.to_account_info(),
        &ctx.accounts.collection.to_account_info(),
        &ctx.accounts.signer.to_account_info(),
        &ctx.accounts.book.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        book_signer_seeds
    )?;

    let escrow_pda=ctx.accounts.escrow.key();
    let escrow=&mut ctx.accounts.escrow;
    //修改状态
    escrow.state=EscrowState::Cancelled;
    ctx.accounts.book.status=BookStatus::Listed;

    emit!(EscrowCancelledEvent{
        escrow:escrow_pda,
        cancelled_by:ctx.accounts.signer.key(),
        buyer:ctx.accounts.buyer.key(),
        price:escrow.price
    });
    Ok(())
}