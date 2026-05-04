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
    bincode::deserialize(&bytes).map_err(|e| ClientError::TxBuildError(e.to_string()))
}

/// 已签名交易中第一个非默认签名，即 RPC 用于判重的交易 id。
pub fn tx_primary_signature(tx: &Transaction) -> Result<Signature, ClientError> {
    tx.signatures
        .iter()
        .find(|s| **s != Signature::default())
        .copied()
        .ok_or_else(|| ClientError::TxVerifyFailed("交易缺少有效签名".into()))
}
