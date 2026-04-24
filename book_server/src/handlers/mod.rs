use axum::{Extension, Json};
use axum::response::IntoResponse;
use serde_json::json;
pub async fn get_me(
    Extension(address): Extension<String>, // 从中间件注入的地址
) -> impl IntoResponse {
    Json(json!({ "address": address, "status": "ok" }))
}