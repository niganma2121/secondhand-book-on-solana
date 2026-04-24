use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::{Escrow, AppError, EscrowState, BOOK_SEED, ESCROW_SEED, Book, BookStatus, nft_to_buyer, PLATFORM_FEE_BPS};
use crate::event::ReceiptConfirmedEvent;
use crate::PLATFORM_FEE_ACCOUNT;
#[derive(Accounts)]
pub struct ConfirmReceipt<'info>{
    #[account(mut)]
    pub buyer:Signer<'info>,
    #[account(
        mut,
    )]
    pub seller:SystemAccount<'info>,
    #[account(
        mut,
        seeds=[BOOK_SEED,escrow.seller.as_ref(),escrow.asset.as_ref()],
        bump
    )]
    pub book:Account<'info,Book>,
    //平台公钥
    #[account(
        mut,
        constraint = platform_fee_account.key() == PLATFORM_FEE_ACCOUNT @ AppError::AdminUnmatch
    )]
    ///CHECK:平台公钥作为抽成
    pub platform_fee_account:UncheckedAccount<'info>,
    #[account(
        mut,
        has_one=buyer @ AppError::BuyerUnmatched,
        has_one=seller @ AppError::SellerUnmatched,
        has_one=book @ AppError::BookUnmatched,
        constraint=escrow.state==EscrowState::Shipped @ AppError::InvalidEscrowState,
        seeds=[ESCROW_SEED,buyer.key().as_ref(),escrow.book.as_ref()],
        bump,
        close=buyer
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

pub fn confirm_receipt(ctx:Context<ConfirmReceipt>)->Result<()>{
    let price=ctx.accounts.escrow.price;
    let bump=ctx.accounts.escrow.bump;

    let buyer_key = ctx.accounts.escrow.buyer;
    let book_key = ctx.accounts.escrow.book;
    //卖家确定收货,转移资金给卖家
    let seller_cpi_accounts=Transfer{
        from:ctx.accounts.escrow.to_account_info(),
        to:ctx.accounts.seller.to_account_info()
    };
    //平台抽成
    let platform_cpi_accounts=Transfer{
        from:ctx.accounts.escrow.to_account_info(),
        to:ctx.accounts.platform_fee_account.to_account_info()
    };
    let seeds:&[&[u8]]=&[
        ESCROW_SEED,
        buyer_key.as_ref(),
        book_key.as_ref(),
        &[bump]
    ];
    let signer_seeds=&[seeds];
    let seller_cpi_ctx=CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        seller_cpi_accounts,
        signer_seeds
    );
    let platform_cpi_ctx=CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        platform_cpi_accounts,
        signer_seeds
    );
    let fee=price*PLATFORM_FEE_BPS/10000;
    let seller_amount=price-fee;
    // 转给卖家
    transfer(seller_cpi_ctx,seller_amount)?;
    //平台抽成
    transfer(platform_cpi_ctx,fee)?;

    //转移NFT
    let signer=ctx.accounts.buyer.to_account_info();
    nft_to_buyer(
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.asset.to_account_info(),
        &ctx.accounts.collection.to_account_info(),
        &signer,
        &ctx.accounts.escrow.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        signer_seeds
    )?;

    //修改状态
    ctx.accounts.book.status=BookStatus::Sold;
    ctx.accounts.escrow.state=EscrowState::Released;


    emit!(ReceiptConfirmedEvent{
        escrow:ctx.accounts.escrow.key(),
        buyer:ctx.accounts.buyer.key(),
        seller:ctx.accounts.seller.key(),
        price
    });
    Ok(())
}