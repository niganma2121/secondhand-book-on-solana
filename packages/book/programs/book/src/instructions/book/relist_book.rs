use anchor_lang::prelude::*;
use crate::{AppError, Book, BookStatus, BOOK_SEED};
use crate::event::RelistBookEvent;
use mpl_core::instructions::ApprovePluginAuthorityV1CpiBuilder;
use mpl_core::types::{PluginAuthority, PluginType};

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
    pub book:Account<'info,Book>,

    #[account(mut, constraint=asset.key()==book.asset @ AppError::InvalidAsset)]
    /// CHECK: mpl-core asset
    pub asset: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: collection for the asset
    pub collection: UncheckedAccount<'info>,
    #[account(address=mpl_core::ID)]
    /// CHECK: mpl-core program
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
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

    // mpl-core 在资产转移后会撤销 FreezeDelegate / TransferDelegate 的链下委托方；
    // 再次上架须由当前 owner 签名将插件管理权重新授回 Book PDA，否则后续 create_escrow 冻结会报 NoApprovals(0x1a)。
    let book_key = book.key();
    let mpl = &ctx.accounts.mpl_core_program.to_account_info();
    let delegate = PluginAuthority::Address { address: book_key };

    ApprovePluginAuthorityV1CpiBuilder::new(mpl)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.owner.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin_type(PluginType::FreezeDelegate)
        .new_authority(delegate.clone())
        .invoke()?;

    ApprovePluginAuthorityV1CpiBuilder::new(mpl)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.owner.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin_type(PluginType::TransferDelegate)
        .new_authority(delegate)
        .invoke()?;

    emit!(RelistBookEvent{
        book:book.key(),
        owner:ctx.accounts.owner.key(),
        new_price
    });
    Ok(())
}
