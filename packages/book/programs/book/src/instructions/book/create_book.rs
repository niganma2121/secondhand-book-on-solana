use crate::constants::BOOK_SEED;
use crate::error::AppError;
use crate::event::CreateEvent;
use crate::{Book, BookStatus};
use anchor_lang::prelude::*;
use mpl_core::instructions::AddPluginV1CpiBuilder;
use mpl_core::types::{FreezeDelegate, Plugin, PluginAuthority, TransferDelegate};
#[derive(Accounts)]
#[instruction(price:u64)]
pub struct CreateBook<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        init,
        payer=seller,
        space=8+Book::INIT_SPACE,
        seeds=[BOOK_SEED,asset.key().as_ref()],
        bump,
        constraint=price>0 @ AppError::InvalidPrice
    )]
    pub book: Account<'info, Book>,
    ///CHECK:MPL-Core NFT地址
    pub asset: UncheckedAccount<'info>,
    #[account(mut)]
    ///CHECK:asset 对应的 collection
    pub collection: UncheckedAccount<'info>,
    #[account(address=mpl_core::ID)]
    ///CHECK:MPL Core program
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_book(
    ctx: Context<CreateBook>,
    price: u64,
    metadata_cid: String,
    metadata_hash: [u8; 32],
) -> Result<()> {
    let book = &mut ctx.accounts.book;

    book.owner = ctx.accounts.seller.key();
    book.seller = ctx.accounts.seller.key();
    book.asset = ctx.accounts.asset.key();
    book.price = price;
    book.status = BookStatus::Listed;
    book.metadata_cid = metadata_cid;
    book.metadata_hash = metadata_hash;

    book.bump = ctx.bumps.book;

    //上架阶段初始化FreezeDelegate插件避免首次购买时再AddPlugin导致授权冲突
    AddPluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(None)
        .payer(&ctx.accounts.seller.to_account_info())
        .authority(Some(&ctx.accounts.seller.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
        .init_authority(PluginAuthority::Address {
            address: ctx.accounts.book.key(),
        })
        .invoke()?;

    // 上架时同时写入 TransferDelegate，授权 book PDA 在托管完成后可执行 NFT 转移。
    AddPluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(None)
        .payer(&ctx.accounts.seller.to_account_info())
        .authority(Some(&ctx.accounts.seller.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::TransferDelegate(TransferDelegate {}))
        .init_authority(PluginAuthority::Address {
            address: ctx.accounts.book.key(),
        })
        .invoke()?;

    emit!(CreateEvent {
        book: ctx.accounts.book.key(),
        seller: ctx.accounts.seller.key(),
        asset: ctx.accounts.asset.key(),
        price
    });
    Ok(())
}
