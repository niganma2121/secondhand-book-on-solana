//! 与业务域无关的基础设施能力（限流、HTTP 小工具、环境变量解析等）。
//! 注意：这里的限流是「可被 handler 调用的函数」，不是 Axum `tower::Layer`；
//! 若要统一套在路由上，可再包一层 `tower::ServiceBuilder` 的中间件。

pub mod env;
pub mod fx_rate;
pub mod http;
pub mod qiniu_upload;
pub mod rate_limit;
