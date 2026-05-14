use std::str::FromStr;
use anchor_client::anchor_lang::prelude::Pubkey;
use anchor_client::solana_sdk::signature::Signature;
use anchor_client::solana_sdk::transaction::Transaction;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use crate::client::error::ClientError;

pub fn parse(s: &str) -> Result<Pubkey, ClientError> {
    Pubkey::from_str(s).map_err(|e| ClientError::InvalidAddress(e.to_string()))
}

pub fn serialize_tx(tx: &Transaction) -> Result<String, ClientError> {
    let bytes = bincode::serialize(tx).map_err(|e| ClientError::TxBuildError(e.to_string()))?;
    Ok(STANDARD.encode(bytes))
}

pub fn deserialize_signed_tx(b64tx: &str) -> Result<Transaction, ClientError> {
    let bytes = STANDARD
        .decode(b64tx)
        .map_err(|e| ClientError::TxVerifyFailed(e.to_string()))?;
    let tx: Transaction = bincode::deserialize(&bytes).map_err(|e| ClientError::TxBuildError(e.to_string()))?;
    // 最低限度校验：必须携带至少一个非默认签名，防止前端传入未签交易
    tx_primary_signature(&tx)?;
    Ok(tx)
}

/// 已签名交易中第一个非默认签名，即 RPC 用于判重的交易 id。
pub fn tx_primary_signature(tx: &Transaction) -> Result<Signature, ClientError> {
    tx.signatures
        .iter()
        .find(|s| **s != Signature::default())
        .copied()
        .ok_or_else(|| ClientError::TxVerifyFailed("交易缺少有效签名".into()))
}

/// 已签名交易中，第一个同时出现在 `party_a` / `party_b` 里的签名账户（用于识别买家/卖家谁发起了 open_dispute）。
pub fn first_party_signer_among(tx: &Transaction, party_a: &str, party_b: &str) -> Option<String> {
    let msg = &tx.message;
    let keys = &msg.account_keys;
    let n = msg.header.num_required_signatures as usize;
    for i in 0..n.min(keys.len()) {
        let k = keys[i].to_string();
        if k == party_a || k == party_b {
            return Some(k);
        }
    }
    None
}
