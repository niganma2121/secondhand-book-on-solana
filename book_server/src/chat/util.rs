///用于解决字节数组(Pubkey)到Base58的转换的问题,能正确序列化

use std::str::FromStr;
use anchor_client::anchor_lang::prelude::Pubkey;
use serde::{Deserialize, Deserializer, Serializer};
pub fn serialize<S>(pubkey: &Pubkey, serializer: S) -> Result<S::Ok, S::Error>
where S: Serializer {
    serializer.serialize_str(&pubkey.to_string())
}
pub fn deserialize<'de, D>(deserializer: D) -> Result<Pubkey, D::Error>
where D: Deserializer<'de> {
    let s = String::deserialize(deserializer)?;
    Pubkey::from_str(&s).map_err(serde::de::Error::custom)
}