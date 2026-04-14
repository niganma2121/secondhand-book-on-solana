use std::collections::HashMap;
use std::sync::Arc;
use axum::response::IntoResponse;
use anyhow::Result;
use axum::extract::{Query, State};
use axum::Json;
use serde_json::json;
use crate::error::AuthError;
use crate::services::auth::sign_in;
use crate::state::AppState;
use crate::types::auth::{AuthResponse, LoginRequest, StringMap};
use crate::utils::auth_utils::generate_stateless_nonce;

//处理获取nonce请求
pub async fn get_nonce_handler(
    Query(params):Query<HashMap<String,String>>,
    State(state):State<Arc<AppState>>,

) ->Result<impl IntoResponse,AuthError>{
    let address=params.get("address")
        .ok_or_else(||AuthError::BadRequest("缺少地址".into()))?;

    let nonce=generate_stateless_nonce(address,state.get_jwt(),)
        .map_err(|e| {
            AuthError::Internal(e.to_string())
        })?;
    Ok(Json(json!({"nonce":nonce})))
}

//处理请求验证颁发JWT
pub async fn login_handler(
    State(state):State<Arc<AppState>>,
    Json(payload):Json<LoginRequest>,
)->Result<impl IntoResponse,AuthError>{
    let jwt_secret=state.get_jwt();
    let token=sign_in(payload,jwt_secret).map_err(|e| {
        AuthError::Unauthorized(e.to_string())
    })?;
    Ok(Json(AuthResponse{token}))
}