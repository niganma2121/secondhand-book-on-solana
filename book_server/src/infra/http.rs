use axum::http::HeaderMap;

/// 从反代头里取客户端 IP；无则返回 `"unknown"`。生产环境请保证 `X-Forwarded-For` / `X-Real-Ip` 由网关注入。
pub fn client_ip_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| {
            s.split(',')
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".into())
}
