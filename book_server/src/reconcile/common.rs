//! 链上账户读取与枚举映射（托管 / 书籍共用）。
use crate::client::types::AnchorService;
use crate::client::{Book, BookStatus, EscrowState};
use anchor_lang::AccountDeserialize;
use anchor_lang::prelude::Pubkey;
use anyhow::Context;

#[derive(Debug, Default, Clone)]
pub struct ReconcileStats {
    pub scanned: usize,
    pub repaired: usize,
}

pub(crate) fn chain_escrow_state_str(s: &EscrowState) -> &'static str {
    match s {
        EscrowState::Paid => "Paid",
        EscrowState::Shipped => "Shipped",
        EscrowState::Released => "Released",
        EscrowState::Cancelled => "Cancelled",
        EscrowState::Disputed => "Disputed",
    }
}

pub(crate) fn chain_book_status_str(s: &BookStatus) -> &'static str {
    match s {
        BookStatus::Listed => "Listed",
        BookStatus::InEscrow => "InEscrow",
        BookStatus::Sold => "Sold",
        BookStatus::DeListed => "DeListed",
    }
}

pub(crate) fn metadata_hash_matches_db(db_hash: &[u8], chain: &[u8; 32]) -> bool {
    db_hash.len() == 32 && db_hash.iter().zip(chain.iter()).all(|(a, b)| a == b)
}

pub(crate) async fn fetch_book_chain(
    anchor: &AnchorService,
    asset: &Pubkey,
) -> anyhow::Result<Book> {
    let program = anchor
        .get_program()
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    let rpc = program.rpc();
    let book_pk = anchor.book_pda(asset);
    let account = rpc
        .get_account(&book_pk)
        .await
        .with_context(|| format!("链上 Book 账户不存在或 RPC 失败 asset={}", asset))?;
    let mut data: &[u8] = &account.data;
    Book::try_deserialize(&mut data).map_err(|e| anyhow::anyhow!("Book 反序列化失败: {e}"))
}
