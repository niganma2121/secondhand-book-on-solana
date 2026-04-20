use anchor_lang::prelude::*;
use mpl_core::instructions::{TransferV1CpiBuilder, UpdatePluginV1CpiBuilder};
use mpl_core::types::{FreezeDelegate, Plugin};

//冻结
pub fn freeze_asset<'info>(
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    mpl_core_program: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    UpdatePluginV1CpiBuilder::new(mpl_core_program)
        .asset(asset)
        .collection(Some(collection))
        .payer(payer)
        .authority(Some(authority))
        .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
        .invoke_signed(signer_seeds)?;

    Ok(())
}
pub fn thaw_asset<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    UpdatePluginV1CpiBuilder::new(mpl_core_program)
        .asset(asset)
        .collection(Some(collection))
        .payer(payer)
        .authority(Some(authority))
        .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
        .invoke_signed(signer_seeds)?;

    Ok(())
}

pub fn transfer_asset<'info>(
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    new_owner: &AccountInfo<'info>,
    mpl_core_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    TransferV1CpiBuilder::new(mpl_core_program)
        .asset(asset)
        .collection(Some(collection))
        .payer(payer)
        .authority(Some(authority))
        .new_owner(new_owner)
        .system_program(Some(system_program))
        .invoke_signed(signer_seeds)?;

    Ok(())
}

pub fn nft_to_buyer<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    escrow: &AccountInfo<'info>,
    buyer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    thaw_asset(
        mpl_core_program,
        asset,
        collection,
        payer,
        escrow,
        signer_seeds,
    )?;
    transfer_asset(
        mpl_core_program,
        asset,
        collection,
        payer,
        escrow,
        buyer,
        system_program,
        signer_seeds,
    )?;
    Ok(())
}

pub fn nft_to_seller<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset: &AccountInfo<'info>,
    collection: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    escrow: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    thaw_asset(
        mpl_core_program,
        asset,
        collection,
        payer,
        escrow,
        signer_seeds,
    )?;
    Ok(())
}
