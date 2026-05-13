use crate::client::error::ClientError;
use crate::client::types::{
    BroadcastCreateBookRequest, BroadcastDelistRequest, BroadcastUpdatePriceRequest,
    BroadcastRelistBookRequest, CreateBookBuildTxRequest, CreateBookMetadataRequest, CreateBookRequest,
    DelistBookRequest, InitCollectionRequest, PinataSignedUploadResponse, PinataUploadSignBody,
    RelistBookBuildTxRequest, UpdatePriceRequest,
};
use crate::client::utils::{lamports_to_price_cny, pinata_create_signed_upload_url, read_multipart_image};
use crate::infra::env::u64_env;
use crate::infra::http::client_ip_from_headers;
use crate::infra::rate_limit::check_fixed_window;
use crate::state::AppState;
use crate::{
    PINATA_SIGN_COVER_MAX_BYTES_ENV, PINATA_SIGN_DETAIL_MAX_BYTES_ENV, PINATA_SIGN_EXPIRES_SECS_ENV,
    RATE_LIMIT_PINATA_SIGN_PER_MIN_IP_ENV, RATE_LIMIT_PINATA_SIGN_PER_MIN_USER_ENV,
};
use axum::extract::{Extension, Multipart, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;

/// 获取 Pinata 直传用临时 URL（Redis 限流 + 需 `PINATA_JWT`）。
pub async fn pinata_signed_upload_url_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    headers: HeaderMap,
    Json(body): Json<PinataUploadSignBody>,
) -> Result<impl IntoResponse, ClientError> {
    let ip_key = client_ip_from_headers(&headers).replace(':', "_");

    let per_user = u64_env(RATE_LIMIT_PINATA_SIGN_PER_MIN_USER_ENV, 30);
    let per_ip = u64_env(RATE_LIMIT_PINATA_SIGN_PER_MIN_IP_ENV, 60);
    check_fixed_window(
        &state.auth_service.redis_pool,
        &format!("rl:pinata_sign:u:{pubkey}"),
        per_user,
        60,
    )
    .await?;
    check_fixed_window(
        &state.auth_service.redis_pool,
        &format!("rl:pinata_sign:ip:{ip_key}"),
        per_ip,
        60,
    )
    .await?;

    let jwt = state.anchor_service.pinata_jwt.as_deref().ok_or_else(|| {
        ClientError::IpfsError(
            "未配置 PINATA_JWT，无法创建直传链接（请在服务器环境变量中设置）".into(),
        )
    })?;

    let purpose = body.purpose.as_deref().unwrap_or("detail").to_ascii_lowercase();
    let cover_max = u64_env(PINATA_SIGN_COVER_MAX_BYTES_ENV, 8 * 1024 * 1024);
    let detail_max = u64_env(PINATA_SIGN_DETAIL_MAX_BYTES_ENV, 4 * 1024 * 1024);
    let max_file_size = if purpose == "cover" {
        cover_max
    } else {
        detail_max
    };

    let expires_in = u64_env(PINATA_SIGN_EXPIRES_SECS_ENV, 120);
    let upload_url = pinata_create_signed_upload_url(jwt, expires_in, max_file_size).await?;

    Ok((
        StatusCode::OK,
        Json(PinataSignedUploadResponse {
            upload_url,
            expires_in,
            max_file_size,
            ipfs_gateway_base: state.anchor_service.pinata_gateway_base.clone(),
            msg: "向 upload_url POST multipart（字段 file、network=public），成功后拿 cid 拼网关地址"
                .into(),
        }),
    ))
}

/// 分步上架：multipart 上传封面图。
pub async fn upload_create_book_cover_handler(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, ClientError> {
    let (bytes, filename, mime) = read_multipart_image(multipart).await?;
    let res = state
        .anchor_service
        .upload_create_book_image(bytes, filename, mime)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 分步上架：multipart 上传单张详情图。
pub async fn upload_create_book_detail_handler(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, ClientError> {
    let (bytes, filename, mime) = read_multipart_image(multipart).await?;
    let res = state
        .anchor_service
        .upload_create_book_image(bytes, filename, mime)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 分步上架：仅上传元数据 JSON。
pub async fn create_book_metadata_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateBookMetadataRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.create_book_metadata_step(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 分步上架：仅组装链上交易（无图片体）。
pub async fn create_book_build_tx_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateBookBuildTxRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_create_book_tx_only(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 转卖：仅组装 relist 链上交易。
pub async fn relist_book_build_tx_handler(
    State(state): State<AppState>,
    Json(req): Json<RelistBookBuildTxRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_relist_book_tx_only(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 构建NFT以及上架书的交易,后端部分签名返回前端签名。
pub async fn create_book_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_create_book(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 初始化平台默认 collection（部署后通常调用一次）。
pub async fn init_collection_handler(
    State(state): State<AppState>,
    Json(req): Json<InitCollectionRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.init_default_collection(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 下架书以及销毁NFT,前端签名确认。
pub async fn delist_book_handler(
    State(state): State<AppState>,
    Json(req): Json<DelistBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_delist_book(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 构建更新书的价格的交易。
pub async fn update_price_handler(
    State(state): State<AppState>,
    Json(req): Json<UpdatePriceRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let res = state.anchor_service.build_update_price(req).await?;
    Ok((StatusCode::OK, Json(res)))
}

/// 处理前端签名后的创建书广播请求。
pub async fn broadcast_create_book_handler(
    State(state): State<AppState>,
    Json(mut req): Json<BroadcastCreateBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    if let Ok(rate) = state.fx_rate_service.get_sol_cny_rate(false).await {
        req.fx_cny_per_sol = Some(rate.cny_per_sol);
        req.price_cny = Some(lamports_to_price_cny(req.price, rate.cny_per_sol));
    }
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_create_book(req, &state.db_service, &state.id_generator, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_relist_book_handler(
    State(state): State<AppState>,
    Json(mut req): Json<BroadcastRelistBookRequest>,
) -> Result<impl IntoResponse, ClientError> {
    if let Ok(rate) = state.fx_rate_service.get_sol_cny_rate(false).await {
        req.fx_cny_per_sol = Some(rate.cny_per_sol);
        req.price_cny = Some(lamports_to_price_cny(req.price, rate.cny_per_sol));
    }
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_relist_book(req, &state.db_service, &state.id_generator, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_delist_handler(
    State(state): State<AppState>,
    Json(req): Json<BroadcastDelistRequest>,
) -> Result<impl IntoResponse, ClientError> {
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_delist_book(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}

pub async fn broadcast_update_price_handler(
    State(state): State<AppState>,
    Json(mut req): Json<BroadcastUpdatePriceRequest>,
) -> Result<impl IntoResponse, ClientError> {
    if let Ok(rate) = state.fx_rate_service.get_sol_cny_rate(false).await {
        req.fx_cny_per_sol = Some(rate.cny_per_sol);
        req.price_cny = Some(lamports_to_price_cny(req.new_price, rate.cny_per_sol));
    }
    let now = chrono::Utc::now().timestamp();
    let res = state
        .anchor_service
        .broadcast_update_price(req, &state.db_service, now)
        .await?;
    Ok((StatusCode::OK, Json(res)))
}
