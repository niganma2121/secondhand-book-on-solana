
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum::response::IntoResponse;
use crate::client::error::ClientError;
use crate::client::types::{CancelEscrowRequest, ConfirmReceiptRequest, CreateBookRequest, CreateEscrowRequest, DelistBookRequest, OpenDisputeRequest, ResolveDisputeRequest, ShipBookRequest, SignedTxRequest, UpdatePriceRequest};
use crate::state::AppState;

///构建NFT以及上架书的交易,后端部分签名返回前端签名
pub async fn create_book_handler(
    State(state):State<AppState>,
    Json(req):Json<CreateBookRequest>
) ->Result<impl IntoResponse,ClientError>{
    let res=state.anchor_service.build_create_book(req).await?;
    Ok((StatusCode::OK,Json(res)))
}

///下架书以及销毁NFT,前端签名确认
pub async fn delist_book(
    State(state):State<AppState>,
    Json(req):Json<DelistBookRequest>
)->Result<impl IntoResponse,ClientError>{
    let res=state.anchor_service.build_delist_book(req).await?;
    Ok((StatusCode::OK,Json(res)))
}

///构建更新书的价格的交易
pub async fn update_price(
    State(state): State<AppState>,
    Json(req): Json<UpdatePriceRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_update_price(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 买家锁定订单，构建创建托管的交易
pub async fn create_escrow(
    State(state): State<AppState>,
    Json(req): Json<CreateEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_create_escrow(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn ship_book(
    State(state): State<AppState>,
    Json(req): Json<ShipBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_ship_book(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 买家确认收货，释放托管资金给卖家,转移NFT
pub async fn confirm_receipt(
    State(state): State<AppState>,
    Json(req): Json<ConfirmReceiptRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_confirm_receipt(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 取消托管订单（买家或卖家均可发起，链上合约负责权限校验）
pub async fn cancel_escrow(
    State(state): State<AppState>,
    Json(req): Json<CancelEscrowRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_cancel_escrow(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 发起仲裁
pub async fn open_dispute(
    State(state): State<AppState>,
    Json(req): Json<OpenDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_open_dispute(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 仲裁员裁决（后端 partial_sign admin，仲裁员补签后广播）
pub async fn resolve_dispute(
    State(state): State<AppState>,
    Json(req): Json<ResolveDisputeRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_resolve_dispute(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 接收前端签名完毕的交易，广播上链
pub async fn broadcast(
    State(state): State<AppState>,
    Json(req): Json<SignedTxRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.broadcast_signed(req).await?;
    Ok((StatusCode::OK, Json(res)))
}