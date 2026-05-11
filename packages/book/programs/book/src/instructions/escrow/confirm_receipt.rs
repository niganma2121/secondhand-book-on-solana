use anchor_lang::prelude::*;
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
        seeds=[BOOK_SEED,escrow.asset.as_ref()],
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
    let escrow_info = ctx.accounts.escrow.to_account_info();
    let seller_info = ctx.accounts.seller.to_account_info();
    let platform_info = ctx.accounts.platform_fee_account.to_account_info();
    let book_seeds:&[&[u8]]=&[
        BOOK_SEED,
        ctx.accounts.book.asset.as_ref(),
        &[ctx.accounts.book.bump]
    ];
    let book_signer_seeds=&[book_seeds];
    let fee=price*PLATFORM_FEE_BPS/10000;
    let seller_amount=price-fee;
    // escrow 为有数据 PDA，不能作为 system transfer 的 from；直接调整 lamports。
    let escrow_lamports = escrow_info.lamports();
    require!(escrow_lamports >= price, AppError::InsufficientEscrowLamports);
    **escrow_info.try_borrow_mut_lamports()? -= price;
    **seller_info.try_borrow_mut_lamports()? += seller_amount;
    **platform_info.try_borrow_mut_lamports()? += fee;

    //转移NFT
    let signer=ctx.accounts.buyer.to_account_info();
    nft_to_buyer(
        &ctx.accounts.mpl_core_program.to_account_info(),
        &ctx.accounts.asset.to_account_info(),
        &ctx.accounts.collection.to_account_info(),
        &signer,
        &ctx.accounts.book.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        book_signer_seeds
    )?;

    //修改状态
    ctx.accounts.book.owner=ctx.accounts.buyer.key();
    ctx.accounts.book.seller=ctx.accounts.buyer.key();
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