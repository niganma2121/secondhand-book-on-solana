use crate::client::error::ClientError;
use crate::client::types::{BroadcastCancelEscrowRequest, BroadcastConfirmReceiptRequest, BroadcastCreateBookRequest, BroadcastCreateEscrowRequest, BroadcastDelistRequest, BroadcastOpenDisputeRequest, BroadcastResolveDisputeRequest, BroadcastShipRequest, BroadcastUpdatePriceRequest, CancelEscrowRequest, ConfirmReceiptRequest, CreateBookRequest, CreateEscrowRequest, DelistBookRequest, OpenDisputeRequest, ResolveDisputeRequest, ShipBookRequest, SignedTxRequest, UpdatePriceRequest};
use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse};

///构建NFT以及上架书的交易,后端部分签名返回前端签名
pub async fn create_book_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_create_book(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

///下架书以及销毁NFT,前端签名确认
pub async fn delist_book_handler(
    State(state): State<AppState>,
    Json(req): Json<DelistBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_delist_book(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

///构建更新书的价格的交易
pub async fn update_price_handler(
    State(state): State<AppState>,
    Json(req): Json<UpdatePriceRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_update_price(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 买家锁定订单，构建创建托管的交易
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

/// 买家确认收货，释放托管资金给卖家,转移NFT
pub async fn confirm_receipt_handler(
    State(state): State<AppState>,
    Json(req): Json<ConfirmReceiptRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_confirm_receipt(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 取消托管订单（买家或卖家均可发起，链上合约负责权限校验）
pub async fn cancel_escrow_handler(
    State(state): State<AppState>,
    Json(req): Json<CancelEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_cancel_escrow(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 发起仲裁
pub async fn open_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<OpenDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_open_dispute(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 仲裁员裁决（后端 partial_sign admin，仲裁员补签后广播）
pub async fn resolve_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<ResolveDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_resolve_dispute(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

///处理前端签名后的交易请求
pub async fn broadcast_create_book_handler(
    State(state):State<AppState>,
    Json(req):Json<BroadcastCreateBookRequest>
)->Result<impl IntoResponse,ClientError>{
    let now=chrono::Utc::now().timestamp();
    let res=state.anchor_service.broadcast_create_book(
        req,
        &state.db_service,
        now
    ).await?;
    Ok((StatusCode::OK,Json(res)))
}

pub async fn broadcast_delist_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastDelistRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_delist_book(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_update_price_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastUpdatePriceRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_update_price(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_create_escrow_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastCreateEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_create_escrow(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_ship_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastShipRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_ship_book(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_confirm_receipt_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastConfirmReceiptRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_confirm_receipt(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_cancel_escrow_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastCancelEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_cancel_escrow(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_open_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastOpenDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_open_dispute(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_resolve_dispute_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastResolveDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state.anchor_service
        .broadcast_resolve_dispute(req, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}



