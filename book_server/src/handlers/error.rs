use crate::AppError;
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;
use serde_json::{Value, json};

pub type HandlerResult = Result<(StatusCode, Json<Value>), AppError>;

pub fn ok<T: Serialize>(payload: T) -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!(payload)))
}

pub fn bad_request(msg: impl Into<String>) -> AppError {
    AppError::BadRequest(msg.into())
}

pub fn not_found(msg: impl Into<String>) -> AppError {
    AppError::NotFound(msg.into())
}
