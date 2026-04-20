use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::{nft_to_seller, BookStatus, Escrow};
use crate::Book;
use crate::{AppError,EscrowState,ESCROW_SEED,BOOK_SEED};
use crate::event::EscrowCancelledEvent;

#[derive(Accounts)]
pub struct CancelEscrow<'info>{
    #[account(mut)]
    pub signer:Signer<'info>,
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
        seeds=[BOOK_SEED,escrow.seller.as_ref(),escrow.asset.as_ref()],
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
    let price=ctx.accounts.escrow.price;

    //返还钱给买家
    let buyer_key=ctx.accounts.buyer.key();
    let book_key=ctx.accounts.escrow.book;
    let bump=ctx.accounts.escrow.bump;
    let cpi_accounts=Transfer{
        from:ctx.accounts.escrow.to_account_info(),
        to:ctx.accounts.buyer.to_account_info()
    };
    let seeds:&[&[u8]]=&[
        ESCROW_SEED,
        buyer_key.as_ref(),
        book_key.as_ref(),
        &[bump]
    ];
    let signer_seeds=&[seeds];
    let cpi_ctx=CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        cpi_accounts,
        signer_seeds
    );
    transfer(cpi_ctx,price)?;

    //解冻NFT
    nft_to_seller(
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.asset.to_account_info(),
        &ctx.accounts.collection.to_account_info(),
        &ctx.accounts.signer.to_account_info(),
        &ctx.accounts.escrow.to_account_info(),
        signer_seeds
    )?;

    let escrow=&mut ctx.accounts.escrow;
    //修改状态
    escrow.state=EscrowState::Cancelled;
    ctx.accounts.book.status=BookStatus::Listed;

    emit!(EscrowCancelledEvent{
        escrow:ctx.accounts.escrow.key(),
        cancelled_by:ctx.accounts.signer.key(),
        buyer:ctx.accounts.buyer.key(),
        price:ctx.accounts.escrow.price
    });
    Ok(())
}