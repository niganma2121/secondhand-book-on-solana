use axum::extract::Multipart;

use crate::client::error::ClientError;

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
