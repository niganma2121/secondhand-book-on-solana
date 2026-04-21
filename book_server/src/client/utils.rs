use std::str::FromStr;
use anchor_client::Transaction;
use anchor_lang::prelude::Pubkey;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use crate::client::error::ClientError;

pub fn parse(s:&str) ->Result<Pubkey,ClientError>{
    Pubkey::from_str(s)
        .map_err(|e|ClientError::InvalidAddress(e.to_string()))
}

pub fn serialize_tx(tx:&Transaction)->Result<String,ClientError>{
    let bytes=bincode::serialize(tx)
        .map_err(|e|ClientError::TxBuildError(e.to_string()))?;
    Ok(STANDARD.encode(bytes))
}

pub fn deserialize_signed_tx(b64tx:&str)->Result<Transaction,ClientError>{
    let bytes=STANDARD.decode(b64tx)
        .map_err(|e|ClientError::TxVerifyFailed(e.to_string()))?;
    bincode::deserialize(&bytes)
        .map_err(|e1|ClientError::TxBuildError(e1.to_string()))
}

