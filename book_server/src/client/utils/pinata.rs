use reqwest::multipart::{Form, Part};
use reqwest::Client as HttpClient;

use crate::client::error::ClientError;
use crate::{
    PINATA_BEARER_PREFIX, PINATA_DEFAULT_IMAGE_MIME, PINATA_HEADER_API_KEY,
    PINATA_HEADER_AUTHORIZATION, PINATA_HEADER_SECRET_KEY, PINATA_METADATA_FILENAME,
    PINATA_UPLOAD_SIGN_URL, PINATA_URL,
};

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

pub async fn upload_to_ipfs(
    data: Vec<u8>,
    filename: String,
    content_type: Option<&str>,
    pinata_jwt: Option<&str>,
    api_key: Option<&str>,
    secret: Option<&str>,
) -> Result<String, ClientError> {
    let part = Part::bytes(data)
        .file_name(filename)
        .mime_str(content_type.unwrap_or(PINATA_DEFAULT_IMAGE_MIME))
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;

    let form = Form::new().part("file", part);

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
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| ClientError::IpfsError(e.to_string()))?;

    if !status.is_success() {
        return Err(ClientError::IpfsError(format!(
            "Pinata上传失败(status={}): {}",
            status, json
        )));
    }

    json["IpfsHash"]
        .as_str()
        .ok_or_else(|| ClientError::IpfsError("Pinata返回格式错误".into()))
        .map(|s| s.to_string())
}

pub async fn upload_json_to_ipfs(
    json: &serde_json::Value,
    pinata_jwt: Option<&str>,
    api_key: Option<&str>,
    secret: Option<&str>,
) -> Result<String, ClientError> {
    let bytes = serde_json::to_vec(json).map_err(|e| ClientError::IpfsError(e.to_string()))?;
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
