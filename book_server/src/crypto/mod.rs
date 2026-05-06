use serde_json::json;

pub struct DefaultEncryptionTemplate {
    pub version: &'static str,
    pub message_template: &'static str,
    pub kdf_name: &'static str,
    pub kdf_params: serde_json::Value,
}

pub fn default_templates() -> Vec<DefaultEncryptionTemplate> {
    vec![DefaultEncryptionTemplate {
        version: "v1",
        message_template: "BookChain Encryption Key Backup v1\npubkey:{pubkey}\napp:{origin}",
        kdf_name: "argon2id",
        kdf_params: json!({
            "memory_kib": 65536,
            "iterations": 3,
            "parallelism": 1,
            "output_len": 32
        }),
    }]
}
