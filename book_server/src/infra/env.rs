use dotenvy::var;

/// 读取 `u64` 环境变量，未设置或解析失败时返回 `default`。
pub fn u64_env(key: &str, default: u64) -> u64 {
    var(key).ok().and_then(|s| s.parse().ok()).unwrap_or(default)
}

/// 读取 `f64` 环境变量；未设置或解析失败时返回 `None`。
pub fn f64_env(key: &str) -> Option<f64> {
    var(key).ok().and_then(|s| s.parse::<f64>().ok())
}
