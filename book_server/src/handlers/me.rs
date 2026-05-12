use crate::AppError;
use crate::db::types::Page;
use crate::handlers::error::{HandlerResult, bad_request, ok};
use crate::state::AppState;
use axum::Extension;
use axum::Json;
use axum::extract::{Path, Query, State};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct PageQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

impl PageQuery {
    pub fn to_page(&self) -> Page {
        Page::new(self.page.unwrap_or(1), self.page_size.unwrap_or(20))
    }
}

// GET /api/me/favorites
pub async fn list_favorites_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let books = state.db_service.list_user_favorites(&pubkey, &page).await?;
    Ok(ok(json!({ "books": books })))
}

// POST /api/me/favorites/:asset  → 已收藏则取消，未收藏则添加
pub async fn toggle_favorite_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(asset): Path<String>,
) -> HandlerResult {
    let now = Utc::now().timestamp();
    if state.db_service.is_favorited(&pubkey, &asset).await? {
        state.db_service.remove_favorite(&pubkey, &asset).await?;
        Ok(ok(json!({ "favorited": false })))
    } else {
        state.db_service.add_favorite(&pubkey, &asset, now).await?;
        Ok(ok(json!({ "favorited": true })))
    }
}
// GET /api/me/orders/buying
pub async fn list_buyer_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let orders = state.db_service.list_buyer_escrows(&pubkey, &page).await?;
    Ok(ok(json!({ "orders": orders })))
}

// GET /api/me/orders/selling
pub async fn list_seller_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let orders = state.db_service.list_seller_escrows(&pubkey, &page).await?;
    Ok(ok(json!({ "orders": orders })))
}

// GET /api/me/orders/:escrow_pda/events
pub async fn list_order_events_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.buyer != pubkey && escrow.seller != pubkey {
        return Err(bad_request("无权限查看该订单历史"));
    }
    let page = q.to_page();
    let events = state.db_service.list_escrow_events(&escrow_pda, &page).await?;
    Ok(ok(json!({ "events": events })))
}

// GET /api/me/books — 当前登录用户作为卖家上架的书籍（与 GET /api/users/:pubkey/books 数据源一致）
pub async fn list_my_books_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let books = state.db_service.list_seller_books(&pubkey, &page).await?;
    Ok(ok(json!({ "books": books })))
}

// GET /api/me/books/created — 当前登录用户创建过的书（第一任主人视角）
pub async fn list_my_created_books_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let books = state.db_service.list_created_books(&pubkey, &page).await?;
    Ok(ok(json!({ "books": books })))
}

// GET /api/me/bought
pub async fn list_bought_books_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let books = state.db_service.list_bought_books(&pubkey, &page).await?;
    let books_with_owner_flag: Vec<_> = books
        .into_iter()
        .map(|b| {
            json!({
                "asset": b.asset,
                "seller": b.seller,
                "price": b.price,
                "price_cny": b.price_cny,
                "fx_cny_per_sol": b.fx_cny_per_sol,
                "status": b.status,
                "name": b.name,
                "cover_url": b.cover_url,
                "author": b.author,
                "category": b.category,
                "condition": b.condition,
                "created_at": b.created_at,
                "seller_username": b.seller_username,
                "is_current_owner": b.is_current_owner
            })
        })
        .collect();
    Ok(ok(json!({ "books": books_with_owner_flag })))
}

// GET /api/me/bought/:asset/escrow-events — 当前用户在该 asset 上作为买家或卖家出现的托管流水（完整地址，仅登录可见）
pub async fn list_my_bought_asset_escrow_events_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(asset): Path<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let events = state
        .db_service
        .list_escrow_events_by_asset_for_party(&asset, &pubkey, &page)
        .await?;
    Ok(ok(json!({ "asset": asset, "events": events })))
}

// POST /api/me/reviews
#[derive(Deserialize)]
pub struct SubmitReviewRequest {
    pub escrow_pda: String,
    pub reviewee: String,
    pub score: i16,
    pub comment: Option<String>,
}

#[derive(Deserialize)]
pub struct UpsertOrderShippingCipherRequest {
    pub seller_ciphertext: String,
    pub seller_nonce: String,
    pub seller_alg: String,
    pub buyer_ciphertext: Option<String>,
    pub buyer_nonce: Option<String>,
    pub buyer_alg: Option<String>,
    pub encryption_key_version: String,
}

#[derive(Deserialize)]
pub struct UpdateMyProfileRequest {
    pub username: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Deserialize)]
pub struct UpsertShippingAddressRequest {
    pub buyer_ciphertext: String,
    pub buyer_nonce: String,
    pub buyer_alg: String,
    pub encryption_key_version: String,
    pub is_default: Option<bool>,
}

fn validate_shipping_address_input(req: &UpsertShippingAddressRequest) -> Result<(), AppError> {
    if req.buyer_ciphertext.trim().is_empty()
        || req.buyer_nonce.trim().is_empty()
        || req.buyer_alg.trim().is_empty()
        || req.encryption_key_version.trim().is_empty()
    {
        return Err(bad_request("地址密文参数不完整"));
    }
    Ok(())
}

pub async fn submit_review_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<SubmitReviewRequest>,
) -> HandlerResult {
    let now = Utc::now().timestamp();
    let id = state
        .id_generator
        .next_id()
        .map_err(|e| AppError::IdGeneratorError(e.to_string()))?;

    state
        .db_service
        .insert_review(
            id as i64,
            &req.escrow_pda,
            &pubkey,
            &req.reviewee,
            req.score,
            req.comment.as_deref(),
            now,
        )
        .await?;

    Ok(ok(json!({ "msg": "评价提交成功" })))
}

// PATCH /api/me/profile
pub async fn update_my_profile_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<UpdateMyProfileRequest>,
) -> HandlerResult {
    let username_trimmed = req.username.as_deref().map(str::trim);
    if let Some(name) = username_trimmed {
        if name.is_empty() {
            return Err(bad_request("昵称不能为空"));
        }
        if name.chars().count() > 32 {
            return Err(bad_request("昵称长度不能超过 32 个字符"));
        }
    }
    if let Some(avatar) = req.avatar.as_deref() {
        if avatar.len() > 1024 {
            return Err(bad_request("头像地址过长"));
        }
    }

    state
        .db_service
        .update_user_profile(&pubkey, username_trimmed, req.avatar.as_deref())
        .await?;

    let user = state
        .db_service
        .get_user(&pubkey)
        .await?
        .ok_or_else(|| bad_request("用户不存在"))?;

    Ok(ok(json!({
        "pubkey":      user.pubkey,
        "username":    user.username,
        "avatar":      user.avatar,
        "enc_pubkey":  user.enc_pubkey,
        "trade_count": user.trade_count,
        "sell_count":  user.sell_count,
        "buy_count":   user.buy_count,
        "reputation_score": user.reputation_score,
        "dispute_total": user.dispute_total,
        "dispute_won": user.dispute_won,
        "dispute_lost": user.dispute_lost,
    })))
}

// POST /api/me/orders/:escrow_pda/shipping-cipher
// 仅买家可写入订单收货地址密文（给卖家解密用，可选给买家自查副本）
pub async fn upsert_order_shipping_cipher_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
    Json(req): Json<UpsertOrderShippingCipherRequest>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.buyer != pubkey {
        return Err(bad_request("仅买家可提交收货密文"));
    }

    let now = Utc::now().timestamp();
    state
        .db_service
        .upsert_escrow_shipping_cipher(
            &escrow_pda,
            &escrow.buyer,
            &escrow.seller,
            &req.seller_ciphertext,
            &req.seller_nonce,
            &req.seller_alg,
            req.buyer_ciphertext.as_deref(),
            req.buyer_nonce.as_deref(),
            req.buyer_alg.as_deref(),
            &req.encryption_key_version,
            now,
        )
        .await?;

    Ok(ok(json!({ "msg": "收货地址密文已保存" })))
}

// GET /api/me/orders/:escrow_pda/shipping-cipher
// 买家或卖家可读取该订单密文（各自前端使用本地通讯私钥解密）
pub async fn get_order_shipping_cipher_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.buyer != pubkey && escrow.seller != pubkey {
        return Err(bad_request("无权限查看该订单密文"));
    }

    let row = state
        .db_service
        .get_escrow_shipping_cipher(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单收货密文未提交"))?;

    Ok(ok(json!({
            "escrow_pda": row.escrow_pda,
            "buyer_pubkey": row.buyer_pubkey,
            "seller_pubkey": row.seller_pubkey,
            "seller_ciphertext": row.seller_ciphertext,
            "seller_nonce": row.seller_nonce,
            "seller_alg": row.seller_alg,
            "buyer_ciphertext": row.buyer_ciphertext,
            "buyer_nonce": row.buyer_nonce,
            "buyer_alg": row.buyer_alg,
            "encryption_key_version": row.encryption_key_version,
            "updated_at": row.updated_at
        })))
}

// POST /api/me/orders/by-asset/:asset/shipping-cipher
// 便于前端在创建托管后（已知 asset）直接提交密文
pub async fn upsert_order_shipping_cipher_by_asset_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(asset): Path<String>,
    Json(req): Json<UpsertOrderShippingCipherRequest>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_active_escrow_by_asset(&asset)
        .await?
        .ok_or_else(|| bad_request("该书当前无活跃订单"))?;
    if escrow.buyer != pubkey {
        return Err(bad_request("仅买家可提交收货密文"));
    }
    let now = Utc::now().timestamp();
    state
        .db_service
        .upsert_escrow_shipping_cipher(
            &escrow.escrow_pda,
            &escrow.buyer,
            &escrow.seller,
            &req.seller_ciphertext,
            &req.seller_nonce,
            &req.seller_alg,
            req.buyer_ciphertext.as_deref(),
            req.buyer_nonce.as_deref(),
            req.buyer_alg.as_deref(),
            &req.encryption_key_version,
            now,
        )
        .await?;

    Ok(ok(json!({ "msg": "收货地址密文已保存", "escrow_pda": escrow.escrow_pda })))
}

// POST /api/me/orders/:escrow_pda/tracking-cipher
// 仅卖家可提交物流单号密文（给买家解密，可选给卖家自查副本）
pub async fn upsert_order_tracking_cipher_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
    Json(req): Json<UpsertOrderShippingCipherRequest>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.seller != pubkey {
        return Err(bad_request("仅卖家可提交物流密文"));
    }

    let now = Utc::now().timestamp();
    state
        .db_service
        .upsert_escrow_tracking_cipher(
            &escrow_pda,
            &escrow.buyer,
            &escrow.seller,
            &req.seller_ciphertext,
            &req.seller_nonce,
            &req.seller_alg,
            req.buyer_ciphertext.as_deref(),
            req.buyer_nonce.as_deref(),
            req.buyer_alg.as_deref(),
            &req.encryption_key_version,
            now,
        )
        .await?;

    Ok(ok(json!({ "msg": "物流单号密文已保存" })))
}

// GET /api/me/orders/:escrow_pda/tracking-cipher
// 买家或卖家可读取该订单物流密文（前端使用本地通讯私钥解密）
pub async fn get_order_tracking_cipher_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.buyer != pubkey && escrow.seller != pubkey {
        return Err(bad_request("无权限查看该订单物流密文"));
    }

    let row = state
        .db_service
        .get_escrow_tracking_cipher(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单物流密文未提交"))?;

    Ok(ok(json!({
            "escrow_pda": row.escrow_pda,
            "buyer_pubkey": row.buyer_pubkey,
            "seller_pubkey": row.seller_pubkey,
            "seller_ciphertext": row.seller_ciphertext,
            "seller_nonce": row.seller_nonce,
            "seller_alg": row.seller_alg,
            "buyer_ciphertext": row.buyer_ciphertext,
            "buyer_nonce": row.buyer_nonce,
            "buyer_alg": row.buyer_alg,
            "encryption_key_version": row.encryption_key_version,
            "updated_at": row.updated_at
        })))
}

pub async fn list_my_shipping_addresses_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
) -> HandlerResult {
    let addresses = state.db_service.list_user_shipping_addresses(&pubkey).await?;
    Ok(ok(json!({ "addresses": addresses })))
}

pub async fn create_my_shipping_address_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Json(req): Json<UpsertShippingAddressRequest>,
) -> HandlerResult {
    validate_shipping_address_input(&req)?;
    let now = Utc::now().timestamp();
    let row = state
        .db_service
        .create_user_shipping_address(
            &pubkey,
            req.buyer_ciphertext.trim(),
            req.buyer_nonce.trim(),
            req.buyer_alg.trim(),
            req.encryption_key_version.trim(),
            req.is_default.unwrap_or(false),
            now,
        )
        .await?;
    Ok(ok(json!({ "address": row })))
}

pub async fn update_my_shipping_address_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(id): Path<i64>,
    Json(req): Json<UpsertShippingAddressRequest>,
) -> HandlerResult {
    validate_shipping_address_input(&req)?;
    let now = Utc::now().timestamp();
    let row = state
        .db_service
        .update_user_shipping_address(
            &pubkey,
            id,
            req.buyer_ciphertext.trim(),
            req.buyer_nonce.trim(),
            req.buyer_alg.trim(),
            req.encryption_key_version.trim(),
            now,
        )
        .await?
        .ok_or_else(|| bad_request("地址不存在"))?;
    Ok(ok(json!({ "address": row })))
}

pub async fn delete_my_shipping_address_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(id): Path<i64>,
) -> HandlerResult {
    let affected = state
        .db_service
        .delete_user_shipping_address(&pubkey, id)
        .await?;
    if affected == 0 {
        return Err(bad_request("地址不存在"));
    }
    Ok(ok(json!({ "msg": "地址已删除" })))
}

pub async fn set_default_my_shipping_address_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(id): Path<i64>,
) -> HandlerResult {
    let now = Utc::now().timestamp();
    let ok_set = state
        .db_service
        .set_default_user_shipping_address(&pubkey, id, now)
        .await?;
    if !ok_set {
        return Err(bad_request("地址不存在"));
    }
    Ok(ok(json!({ "msg": "默认地址已更新" })))
}
