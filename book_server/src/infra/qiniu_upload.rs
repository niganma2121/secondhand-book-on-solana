//! HMAC-SHA1 按 RFC 2104 手写；Base64 使用 URL_SAF

use base64::engine::general_purpose::URL_SAFE;
use base64::Engine;
use serde_json::Value;
use sha1::{Digest, Sha1};

fn sha1_raw(bytes: &[u8]) -> [u8; 20] {
    let mut h = Sha1::new();
    h.update(bytes);
    h.finalize().into()
}

fn hmac_sha1(key: &[u8], msg: &[u8]) -> [u8; 20] {
    const B: usize = 64;
    let key_block: [u8; B] = if key.len() > B {
        let d = sha1_raw(key);
        let mut buf = [0u8; B];
        buf[..20].copy_from_slice(&d);
        buf
    } else {
        let mut buf = [0u8; B];
        buf[..key.len()].copy_from_slice(key);
        buf
    };
    let mut ipad = [0u8; B];
    let mut opad = [0u8; B];
    for i in 0..B {
        ipad[i] = key_block[i] ^ 0x36;
        opad[i] = key_block[i] ^ 0x5c;
    }
    let mut inner = Sha1::new();
    inner.update(ipad);
    inner.update(msg);
    let inner_out = inner.finalize();
    let mut outer = Sha1::new();
    outer.update(opad);
    outer.update(inner_out);
    outer.finalize().into()
}

/// `policy` 为七牛策略 JSON（含 `scope`、`deadline` 等）。
pub fn qiniu_upload_token(access_key: &str, secret_key: &str, policy: &Value) -> Result<String, &'static str> {
    let policy_json = serde_json::to_string(policy).map_err(|_| "policy")?;
    let encoded_policy = URL_SAFE.encode(policy_json.as_bytes());
    let sig = hmac_sha1(secret_key.as_bytes(), encoded_policy.as_bytes());
    let sign = URL_SAFE.encode(sig);
    Ok(format!("{access_key}:{sign}:{encoded_policy}"))
}
