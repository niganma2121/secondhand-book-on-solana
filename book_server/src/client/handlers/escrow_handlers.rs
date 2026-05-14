use crate::client::error::ClientError;
use crate::client::types::{
    BroadcastCreateEscrowAutoRequest,
    BroadcastCancelEscrowRequest, BroadcastConfirmReceiptRequest,
    BroadcastOpenDisputeRequest, BroadcastResolveDisputeRequest, BroadcastShipRequest,
    BroadcastSetPreShipLockRequest,
    CancelEscrowRequest, ConfirmReceiptRequest, CreateEscrowRequest, OpenDisputeRequest,
    ResolveDisputeRequest, SetPreShipLockRequest, ShipBookRequest,
};
use crate::state::AppState;
use axum::Extension;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

/// 买家锁定订单，构建创建托管的交易。
pub async fn create_escrow_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_create_escrow(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn ship_book_handler(
    State(state): State<AppState>,
    Json(req): Json<ShipBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_ship_book(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn set_pre_ship_lock_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<SetPreShipLockRequest>,
) -> Result<impl IntoResponse, ClientError> {
    if req.seller != pubkey {
        return Err(ClientError::Forbidden);
    }
    let res = state.anchor_service.build_set_pre_ship_lock(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 买家确认收货，释放托管资金给卖家,转移NFT。
pub async fn confirm_receipt_handler(
    State(state): State<AppState>,
    Json(req): Json<ConfirmReceiptRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_confirm_receipt(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 取消托管订单（买家或卖家均可发起；本站额外拦截：锁单后买家不可构建取消交易）。
pub async fn cancel_escrow_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<CancelEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    if req.signer != pubkey {
        return Err(ClientError::Forbidden);
    }
    let escrow_row = state
        .db_service
        .get_active_escrow_by_asset(&req.asset)
        .await
        .map_err(|e| ClientError::DbError(e.to_string()))?
        .ok_or_else(|| ClientError::BadRequest("订单不存在或已结束".into()))?;
    if escrow_row.buyer != req.buyer || escrow_row.seller != req.seller {
        return Err(ClientError::BadRequest("订单信息不匹配".into()));
    }
    if req.signer == escrow_row.buyer && escrow_row.pre_ship_locked {
        return Err(ClientError::BadRequest(
            "卖家已锁单备发货，买家暂不可取消订单".into(),
        ));
    }
    let res = state.anchor_service.build_cancel_escrow(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 发起仲裁。
pub async fn open_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<OpenDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_open_dispute(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 仲裁员裁决（后端 partial_sign admin，仲裁员补签后广播）。
pub async fn resolve_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<ResolveDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_resolve_dispute(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_create_escrow_auto_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastCreateEscrowAutoRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_create_escrow_auto(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_ship_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastShipRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_ship_book(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_set_pre_ship_lock_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<BroadcastSetPreShipLockRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let escrow = state
        .db_service
        .get_escrow(&req.escrow_pda)
        .await
        .map_err(|e| ClientError::DbError(e.to_string()))?
        .ok_or_else(|| ClientError::BadRequest("订单不存在".into()))?;
    if escrow.seller != pubkey {
        return Err(ClientError::Forbidden);
    }
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_set_pre_ship_lock(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_confirm_receipt_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastConfirmReceiptRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_confirm_receipt(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_cancel_escrow_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<BroadcastCancelEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let escrow = state
        .db_service
        .get_escrow(&req.escrow_pda)
        .await
        .map_err(|e| ClientError::DbError(e.to_string()))?
        .ok_or_else(|| ClientError::BadRequest("订单不存在".into()))?;
    if escrow.buyer != pubkey && escrow.seller != pubkey {
        return Err(ClientError::Forbidden);
    }
    if escrow.asset != req.asset {
        return Err(ClientError::BadRequest("订单与资产不匹配".into()));
    }
    if escrow.buyer == pubkey && escrow.pre_ship_locked {
        return Err(ClientError::BadRequest(
            "卖家已锁单备发货，买家暂不可取消订单".into(),
        ));
    }
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_cancel_escrow(req, &state.db_service, &pubkey, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_open_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastOpenDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_open_dispute(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_resolve_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastResolveDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_resolve_dispute(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}
