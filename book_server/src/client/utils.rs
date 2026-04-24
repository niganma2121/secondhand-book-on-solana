use std::str::FromStr;
use anchor_client::solana_sdk::transaction::Transaction;
use anchor_client::anchor_lang::prelude::Pubkey;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::multipart::{Form, Part};
use crate::client::error::ClientError;
use crate::PINATA_URL;
use reqwest::Client as HttpClient;
use sha2::{Digest, Sha256};

//----交易序列化操作------
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


//----Ipfs相关------
pub async fn upload_to_ipfs(
    data:Vec<u8>,
    filename:String,
    content_type:&str,
    api_key:&str,
    secret:&str
)->Result<String,ClientError>{
    let part=Part::bytes(data)
        .file_name(filename)
        .mime_str(content_type)
        .map_err(|e|ClientError::IpfsError(e.to_string()))?;

    let form=Form::new().part("file",part);

    let res = HttpClient::new()
        .post(PINATA_URL)
        .header("pinata_api_key", api_key)
        .header("pinata_secret_api_key", secret)
        .multipart(form)
        .send()
        .await
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;

    let json:serde_json::Value=res.json()
        .await
        .map_err(|e1|ClientError::IpfsError(e1.to_string()))?;

    json["IpfsHash"]
        .as_str()
        .ok_or_else(|| ClientError::IpfsError("Pinata返回格式错误".into()))
        .map(|s| s.to_string())
}

pub async fn upload_json_to_ipfs(
    json:&serde_json::Value,
    api_key:&str,
    secret:&str
)->Result<String,ClientError>{
    let bytes = serde_json::to_vec(json)
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;
    upload_to_ipfs(bytes, "metadata.json".into(), "application/json",api_key,secret).await
}

pub fn hash_json(json: &serde_json::Value) -> [u8; 32] {
    let s = serde_json::to_string(json).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hasher.finalize().into()
}