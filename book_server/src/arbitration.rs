//! 与链上程序 `packages/book/programs/book/src/constants.rs` 中 `ARBITRATORS` 对齐。
//! 可选环境变量 `ARBITRATOR_PUBKEYS`（逗号分隔）覆盖默认三地址；部署新仲裁员时需与链上常量同步。

use std::env;

const DEFAULT_ARBITRATORS: &[&str] = &[
    "A5JSJ3J184YKqB71dFG47XrmmxmZqTZRUah9udC4dsnZ",
    "CCiL4DCuzwKGSMYDDWA3E84XtNhsGc1SeWekNJvVF71j",
    "EKufV8XKB5QfX52xDbEjsYts8CHsiz8QihXCw9A6G6Fj",
];

pub fn arbitrator_pubkeys() -> Vec<String> {
    if let Ok(raw) = env::var("ARBITRATOR_PUBKEYS") {
        let v: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !v.is_empty() {
            return v;
        }
    }
    DEFAULT_ARBITRATORS.iter().map(|s| (*s).to_string()).collect()
}

pub fn is_arbitrator(pubkey: &str) -> bool {
    arbitrator_pubkeys().iter().any(|p| p == pubkey)
}
