//! Redis 固定窗口限流（INCR + EXPIRE）。
use deadpool_redis::redis::cmd;
use deadpool_redis::Pool;

use crate::client::error::ClientError;

/// `max` 次 / `window_secs` 秒内；超过则 `ClientError::RateLimited`。
pub async fn check_fixed_window(
    pool: &Pool,
    key: &str,
    max: u64,
    window_secs: u64,
) -> Result<(), ClientError> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| ClientError::TxBuildError(format!("Redis 连接失败: {e}")))?;
    let count: i64 = cmd("INCR")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| ClientError::TxBuildError(format!("Redis INCR: {e}")))?;
    if count == 1 {
        let _: () = cmd("EXPIRE")
            .arg(key)
            .arg(window_secs as i64)
            .query_async(&mut conn)
            .await
            .map_err(|e| ClientError::TxBuildError(format!("Redis EXPIRE: {e}")))?;
    }
    if count as u64 > max {
        return Err(ClientError::RateLimited);
    }
    Ok(())
}
