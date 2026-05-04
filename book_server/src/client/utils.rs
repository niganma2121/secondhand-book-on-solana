use std::str::FromStr;
use anchor_client::solana_sdk::signature::Signature;
use anchor_client::solana_sdk::transaction::Transaction;
use anchor_client::anchor_lang::prelude::Pubkey;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::multipart::{Form, Part};
use crate::client::error::ClientError;
use crate::{
    PINATA_BEARER_PREFIX, PINATA_DEFAULT_IMAGE_MIME, PINATA_HEADER_API_KEY,
    PINATA_HEADER_AUTHORIZATION, PINATA_HEADER_SECRET_KEY, PINATA_METADATA_FILENAME, PINATA_UPLOAD_SIGN_URL,
    PINATA_URL,
};
use reqwest::Client as HttpClient;
use sha2::{Digest, Sha256};
use axum::extract::Multipart;

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

/// 已签名交易中第一个非默认签名，即 RPC 用于判重的交易 id。
pub fn tx_primary_signature(tx: &Transaction) -> Result<Signature, ClientError> {
    tx.signatures
        .iter()
        .find(|s| **s != Signature::default())
        .copied()
        .ok_or_else(|| ClientError::TxVerifyFailed("交易缺少有效签名".into()))
}

//----multipart 上传（上架分步等）------
/// 从 `multipart/form-data` 中读取 `file` 与可选的 `mime_type` / `mime` 字段。
pub async fn read_multipart_image(
    mut multipart: Multipart,
) -> Result<(Vec<u8>, String, Option<String>), ClientError> {
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut filename = "image".to_string();
    let mut mime_type: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ClientError::TxBuildError(e.to_string()))?
    {
        match field.name() {
            Some("file") => {
                if let Some(n) = field.file_name() {
                    filename = n.to_string();
                }
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| ClientError::TxBuildError(e.to_string()))?;
                file_bytes = Some(bytes.to_vec());
            }
            Some("mime_type") | Some("mime") => {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| ClientError::TxBuildError(e.to_string()))?;
                let s = String::from_utf8_lossy(&bytes).trim().to_string();
                if !s.is_empty() {
                    mime_type = Some(s);
                }
            }
            _ => {}
        }
    }
    let bytes = file_bytes.ok_or_else(|| ClientError::TxBuildError("缺少 file 字段".into()))?;
    if bytes.is_empty() {
        return Err(ClientError::TxBuildError("文件为空".into()));
    }
    Ok((bytes, filename, mime_type))
}

/// 调用 Pinata v3 `POST /files/sign`，拿到浏览器直传用的短期 URL（服务端持有 JWT）。
pub async fn pinata_create_signed_upload_url(
    jwt: &str,
    expires_secs: u64,
    max_file_size: u64,
) -> Result<String, ClientError> {
    let date = chrono::Utc::now().timestamp();
    let body = serde_json::json!({
        "date": date,
        "expires": expires_secs,
        "max_file_size": max_file_size,
        "allow_mime_types": ["image/*"],
    });
    let client = HttpClient::new();
    let bearer = format!("{}{}", PINATA_BEARER_PREFIX, jwt);
    let res = client
        .post(PINATA_UPLOAD_SIGN_URL)
        .header(PINATA_HEADER_AUTHORIZATION, bearer)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;
    if !status.is_success() {
        return Err(ClientError::IpfsError(format!(
            "Pinata 签名 URL 失败({status}): {text}"
        )));
    }
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| ClientError::IpfsError(e.to_string()))?;
    v.get("data")
        .and_then(|d| d.as_str())
        .map(str::to_string)
        .ok_or_else(|| ClientError::IpfsError("Pinata 响应缺少 data 字段".into()))
}

//----Ipfs相关------
pub async fn upload_to_ipfs(
    data:Vec<u8>,
    filename:String,
    content_type: Option<&str>,
    pinata_jwt: Option<&str>,
    api_key: Option<&str>,
    secret: Option<&str>,
)->Result<String,ClientError>{
    let part=Part::bytes(data)
        .file_name(filename)
        .mime_str(content_type.unwrap_or(PINATA_DEFAULT_IMAGE_MIME))
        .map_err(|e|ClientError::IpfsError(e.to_string()))?;

    let form=Form::new().part("file",part);

    let mut req = HttpClient::new().post(PINATA_URL);
    if let Some(jwt) = pinata_jwt {
        let bearer = format!("{PINATA_BEARER_PREFIX}{jwt}");
        req = req.header(PINATA_HEADER_AUTHORIZATION, bearer);
    } else {
        let api = api_key.ok_or_else(|| ClientError::IpfsError("缺少PINATA_API_KEY".into()))?;
        let sec = secret.ok_or_else(|| ClientError::IpfsError("缺少PINATA_SECRET".into()))?;
        req = req
            .header(PINATA_HEADER_API_KEY, api)
            .header(PINATA_HEADER_SECRET_KEY, sec);
    }

    let res = req
        .multipart(form)
        .send()
        .await
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;

    let status = res.status();
    let json:serde_json::Value=res.json()
        .await
        .map_err(|e1|ClientError::IpfsError(e1.to_string()))?;

    if !status.is_success() {
        return Err(ClientError::IpfsError(format!(
            "Pinata上传失败(status={}): {}",
            status,
            json
        )));
    }

    json["IpfsHash"]
        .as_str()
        .ok_or_else(|| ClientError::IpfsError("Pinata返回格式错误".into()))
        .map(|s| s.to_string())
}

pub async fn upload_json_to_ipfs(
    json:&serde_json::Value,
    pinata_jwt: Option<&str>,
    api_key: Option<&str>,
    secret: Option<&str>,
)->Result<String,ClientError>{
    let bytes = serde_json::to_vec(json)
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;
    upload_to_ipfs(
        bytes,
        PINATA_METADATA_FILENAME.into(),
        Some("application/json"),
        pinata_jwt,
        api_key,
        secret,
    )
    .await
}

//本地hash存储一份
pub fn hash_json(json: &serde_json::Value) -> [u8; 32] {
    let s = serde_json::to_string(json).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hasher.finalize().into()
}

//判断图片类型
fn mime_from_filename(filename: &str) -> Option<&'static str> {
    let ext = filename.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

fn mime_from_magic_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 3 && bytes[0..3] == [0xFF, 0xD8, 0xFF] {
        return Some("image/jpeg");
    }
    if bytes.len() >= 8 && bytes[0..8] == [137, 80, 78, 71, 13, 10, 26, 10] {
        return Some("image/png");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() >= 6 && (&bytes[0..6] == b"GIF87a" || &bytes[0..6] == b"GIF89a") {
        return Some("image/gif");
    }
    None
}

///校验
pub fn resolve_image_mime_type(
    declared_mime: Option<&str>,
    filename: &str,
    bytes: &[u8],
) -> Result<String, ClientError> {
    let declared = declared_mime
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_ascii_lowercase());
    let from_name = mime_from_filename(filename).map(ToOwned::to_owned);
    let from_magic = mime_from_magic_bytes(bytes).map(ToOwned::to_owned);

    let final_mime = if let Some(m) = declared.clone() {
        m
    } else if let Some(m) = from_magic.clone() {
        m
    } else if let Some(m) = from_name.clone() {
        m
    } else {
        return Err(ClientError::InvalidImageType(format!(
            "无法识别图片类型: {}",
            filename
        )));
    };

    let allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if !allowed.contains(&final_mime.as_str()) {
        return Err(ClientError::InvalidImageType(format!(
            "不支持的图片类型: {}",
            final_mime
        )));
    }

    if let Some(magic) = from_magic {
        if magic != final_mime {
            return Err(ClientError::InvalidImageType(format!(
                "图片类型与文件内容不一致: mime={} content={}",
                final_mime, magic
            )));
        }
    }

    Ok(final_mime)
}