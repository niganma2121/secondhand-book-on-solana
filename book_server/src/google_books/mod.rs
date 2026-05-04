//! Google Books API v1 代理（结构与 `auth` 模块一致：`handler` / `service` / `types`）。

pub mod handler;
pub mod service;
pub mod types;

mod error;
mod parse;

pub use error::GoogleBooksError;
pub use handler::*;
pub use service::search_volumes;
pub use types::GoogleBooksHit;
