use anchor_lang::prelude::*;
use crate::{AppError, Book, BookStatus, BOOK_SEED};
use crate::event::RelistBookEvent;
use mpl_core::instructions::{ApprovePluginAuthorityV1CpiBuilder, UpdateV1CpiBuilder};
use mpl_core::types::{PluginAuthority, PluginType};

/// 与 MPL Core 资产 `uri` 字段常见上限对齐（网关 + CID）。
const MAX_METADATA_URL_LEN: usize = 512;

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
    metadata_hash:[u8;32],
    metadata_url:String,
)->Result<()>{
    require!(new_price > 0, AppError::InvalidPrice);
    let normalized_cid = metadata_cid.trim();
    require!(!normalized_cid.is_empty(), AppError::EmptyMetadataCid);
    // 与 Book 账户里#[max_len(64)]保持一致
    require!(normalized_cid.as_bytes().len() <= 64, AppError::MetadataCidTooLong);

    let trimmed_url = metadata_url.trim();
    require!(!trimmed_url.is_empty(), AppError::EmptyMetadataUrl);
    require!(trimmed_url.len() <= MAX_METADATA_URL_LEN, AppError::MetadataUrlTooLong);

    let book_key = ctx.accounts.book.key();
    let asset_pubkey = ctx.accounts.book.asset;
    let bump = ctx.accounts.book.bump;
    let book_seeds: &[&[u8]] = &[BOOK_SEED, asset_pubkey.as_ref(), &[bump]];

    {
        let book = &mut ctx.accounts.book;
        book.seller = ctx.accounts.owner.key();
        book.price = new_price;
        book.metadata_cid = normalized_cid.to_string();
        book.metadata_hash = metadata_hash;
        book.status = BookStatus::Listed;
    }

    let mpl = &ctx.accounts.mpl_core_program.to_account_info();
    // 将 MPL Core 资产主 `uri` 与上架元数据对齐；须由 Book PDA 作为 update authority 签名（见 create 时 mint 参数）。
    UpdateV1CpiBuilder::new(mpl)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(None)
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.book.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .new_uri(trimmed_url.to_string())
        .invoke_signed(&[book_seeds])?;

    // mpl-core 在资产转移后会撤销 FreezeDelegate / TransferDelegate 的链下委托方；
    // 再次上架须由当前 owner 签名将插件管理权重新授回 Book PDA，否则后续 create_escrow 冻结会报 NoApprovals(0x1a)。
    let delegate = PluginAuthority::Address {
        address: book_key,
    };

    ApprovePluginAuthorityV1CpiBuilder::new(mpl)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(None)
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.owner.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin_type(PluginType::FreezeDelegate)
        .new_authority(delegate.clone())
        .invoke()?;

    ApprovePluginAuthorityV1CpiBuilder::new(mpl)
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(None)
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.owner.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin_type(PluginType::TransferDelegate)
        .new_authority(delegate)
        .invoke()?;

    emit!(RelistBookEvent {
        book: book_key,
        owner: ctx.accounts.owner.key(),
        new_price,
    });
    Ok(())
}
