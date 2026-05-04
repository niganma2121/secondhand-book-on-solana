use sha2::{Digest, Sha256};

use crate::client::error::ClientError;

// 本地hash存储一份
pub fn hash_json(json: &serde_json::Value) -> [u8; 32] {
    let s = serde_json::to_string(json).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hasher.finalize().into()
}

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

/// 根据前端声明、扩展名与魔数校验图片 mime。
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
