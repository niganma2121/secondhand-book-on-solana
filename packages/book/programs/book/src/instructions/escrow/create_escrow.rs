use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer,Transfer};
use crate::{Book, Escrow, EscrowState, BookStatus, AppError, ESCROW_SEED, BOOK_SEED, freeze_asset};
use crate::event::EscrowCreateEvent;

#[derive(Accounts)]
pub struct CreateEscrow<'info>{
    #[account(mut)]
    pub buyer:Signer<'info>,
    pub seller:SystemAccount<'info>,

    #[account(
        mut,
        constraint=book.status==BookStatus::Listed @ AppError::InvalidStatus,
        has_one=seller,
        seeds=[BOOK_SEED,seller.key().as_ref(),book.asset.as_ref()],
        bump
    )]
    pub book:Account<'info,Book>,

    #[account(
        init,
        payer=buyer,
        space=8+Escrow::INIT_SPACE,
        /*买家来开启这个托管,因此使用他的公钥来作为种子*/
        seeds=[ESCROW_SEED,buyer.key().as_ref(),book.key().as_ref()],
        bump,
    )]
    pub escrow:Account<'info,Escrow>,
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

pub fn create_escrow(ctx:Context<CreateEscrow>)->Result<()>{
    let price=ctx.accounts.book.price;
    //锁定资金
    let cpi_accounts=Transfer {
        from:ctx.accounts.buyer.to_account_info(),
        to:ctx.accounts.escrow.to_account_info()
    };
    let cpi_ctx=CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        cpi_accounts
    );
    transfer(cpi_ctx,price)?;

    //冻结NFT
    let buyer_key=ctx.accounts.buyer.key();
    let book_key=ctx.accounts.book.key();

    let seeds:&[&[u8]]=&[
        ESCROW_SEED,
        buyer_key.as_ref(),
        book_key.as_ref(),
        &[ctx.bumps.escrow]
    ];
    let signer_seeds=&[seeds];

    //冻结NFT
    freeze_asset(
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.asset.to_account_info(),
        &ctx.accounts.collection.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.escrow.to_account_info(),
        signer_seeds
    )?;
    let escrow=&mut ctx.accounts.escrow;
    escrow.seller=ctx.accounts.seller.key();
    escrow.buyer=ctx.accounts.buyer.key();
    escrow.asset=ctx.accounts.book.asset;
    escrow.book=ctx.accounts.book.key();
    escrow.price=ctx.accounts.book.price;
    escrow.state=EscrowState::Paid;
    escrow.ship=None;
    escrow.dispute=None;
    escrow.create_at=Clock::get()?.unix_timestamp;
    escrow.bump=ctx.bumps.escrow;
    //更新书的状态
    ctx.accounts.book.status=BookStatus::InEscrow;

    emit!(EscrowCreateEvent{
        escrow:ctx.accounts.escrow.key(),
        book:ctx.accounts.book.key(),
        buyer:ctx.accounts.buyer.key(),
        seller:ctx.accounts.seller.key(),
        price
    });
    Ok(())
}