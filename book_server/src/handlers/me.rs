use crate::AppError;
use crate::arbitration::is_arbitrator;
use crate::db::types::{EscrowDisputeSubmissionRevisionRow, EscrowRow, Page};
use crate::handlers::error::{HandlerResult, bad_request, ok};
use crate::state::AppState;
use axum::Extension;
use axum::Json;
use axum::extract::{Path, Query, State};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

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

fn dispute_revision_json_value(
    r: &EscrowDisputeSubmissionRevisionRow,
    revision_index: i32,
    include_private: bool,
) -> Value {
    if include_private {
        json!({
            "id": r.id,
            "revision_index": revision_index,
            "initiator": r.initiator,
            "public_text": r.public_text,
            "public_attachment_urls": r.public_attachment_urls,
            "private_text": r.private_text,
            "created_at": r.created_at,
        })
    } else {
        json!({
            "id": r.id,
            "revision_index": revision_index,
            "initiator": r.initiator,
            "public_text": r.public_text,
            "public_attachment_urls": r.public_attachment_urls,
            "created_at": r.created_at,
        })
    }
}

/// 按「同一 initiator 的 created_at」顺序编号第 1、2…次提交。
fn revision_rows_with_indices(
    mut rows: Vec<EscrowDisputeSubmissionRevisionRow>,
) -> Vec<(EscrowDisputeSubmissionRevisionRow, i32)> {
    rows.sort_by(|a, b| {
        a.initiator
            .cmp(&b.initiator)
            .then(a.created_at.cmp(&b.created_at))
            .then(a.id.cmp(&b.id))
    });
    let mut n: HashMap<String, i32> = HashMap::new();
    rows.into_iter()
        .map(|r| {
            let k = r.initiator.trim().to_string();
            let e = n.entry(k).or_insert(0);
            *e += 1;
            let idx = *e;
            (r, idx)
        })
        .collect()
}

#[derive(Deserialize)]
pub struct PostDisputeSubmissionBody {
    pub public_text: String,
    pub public_attachment_urls: Vec<String>,
    pub private_text: Option<String>,
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

async fn escrow_orders_json_with_review_flags(
    orders: Vec<EscrowRow>,
    pubkey: &str,
    db:     &crate::db::DBService,
) -> Result<Vec<Value>, sqlx::Error> {
    let pdas: Vec<String> = orders.iter().map(|o| o.escrow_pda.clone()).collect();
    let reviewed = db.escrow_pdas_reviewed_by(pubkey, &pdas).await?;
    let reviewed_set: HashSet<String> = reviewed.into_iter().collect();
    Ok(orders
        .into_iter()
        .map(|o| {
            let submitted = reviewed_set.contains(&o.escrow_pda);
            let mut v = serde_json::to_value(&o).unwrap_or(json!({}));
            if let Some(m) = v.as_object_mut() {
                m.insert("my_review_submitted".to_string(), json!(submitted));
            }
            v
        })
        .collect())
}

// GET /api/me/orders/buying
pub async fn list_buyer_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let orders = state.db_service.list_buyer_escrows(&pubkey, &page).await?;
    let orders_json = escrow_orders_json_with_review_flags(orders, &pubkey, &state.db_service)
        .await
        .map_err(AppError::from)?;
    Ok(ok(json!({ "orders": orders_json })))
}

// GET /api/me/orders/selling
pub async fn list_seller_escrows_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let orders = state.db_service.list_seller_escrows(&pubkey, &page).await?;
    let orders_json = escrow_orders_json_with_review_flags(orders, &pubkey, &state.db_service)
        .await
        .map_err(AppError::from)?;
    Ok(ok(json!({ "orders": orders_json })))
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
    if escrow.buyer != pubkey && escrow.seller != pubkey && !is_arbitrator(&pubkey) {
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
    let escrow_pda = req.escrow_pda.trim();
    let reviewee = req.reviewee.trim();
    if escrow_pda.is_empty() {
        return Err(bad_request("escrow_pda 不能为空"));
    }
    if reviewee.is_empty() {
        return Err(bad_request("被评价方不能为空"));
    }
    if reviewee == pubkey.as_str() {
        return Err(bad_request("不能评价自己"));
    }
    if req.score < 1 || req.score > 5 {
        return Err(bad_request("评分须在 1～5 之间"));
    }
    let comment_trimmed = req.comment.as_deref().map(str::trim).filter(|c| !c.is_empty());
    if let Some(c) = comment_trimmed {
        if c.chars().count() > 2000 {
            return Err(bad_request("评价内容不超过 2000 字"));
        }
    }

    let escrow = state
        .db_service
        .get_escrow(escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.state != "Released" {
        return Err(bad_request("仅已完成订单可评价"));
    }
    let expected_peer = if pubkey == escrow.buyer {
        escrow.seller.as_str()
    } else if pubkey == escrow.seller {
        escrow.buyer.as_str()
    } else {
        return Err(bad_request("你不是该订单的买家或卖家"));
    };
    if reviewee != expected_peer {
        return Err(bad_request("被评价方须为订单中的另一方"));
    }
    if state
        .db_service
        .get_escrow_review(escrow_pda, &pubkey)
        .await?
        .is_some()
    {
        return Err(bad_request("你已评价过该订单"));
    }

    state.db_service.insert_user(&pubkey, now).await?;
    state.db_service.insert_user(reviewee, now).await?;

    let id = state
        .id_generator
        .next_id()
        .map_err(|e| AppError::IdGeneratorError(e.to_string()))?;

    state
        .db_service
        .insert_review(
            id as i64,
            escrow_pda,
            &pubkey,
            reviewee,
            req.score,
            comment_trimmed,
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
    if escrow.pre_ship_locked {
        return Err(bad_request("卖家已锁单备发货，暂不可修改收货地址"));
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
    if escrow.pre_ship_locked {
        return Err(bad_request("卖家已锁单备发货，暂不可修改收货地址"));
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

// GET /api/me/arbitration/disputes — 仅仲裁员 JWT；返回 state=Disputed 的托管 + collection
pub async fn list_arbitration_disputes_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    if !is_arbitrator(&pubkey) {
        return Err(bad_request("仅链上登记的仲裁员可访问此队列"));
    }
    let page = q.to_page();
    let orders = state
        .db_service
        .list_disputed_escrows_for_arbitration(&page)
        .await?;
    Ok(ok(json!({ "orders": orders })))
}

/// POST /api/me/orders/:escrow_pda/dispute-submission — 发起方在链上进入 Disputed 后提交材料（公开 + 可选仅仲裁员）
pub async fn post_dispute_submission_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
    Json(body): Json<PostDisputeSubmissionBody>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.state != "Disputed" {
        return Err(bad_request("订单须处于仲裁中方可提交材料"));
    }
    if escrow.buyer != pubkey && escrow.seller != pubkey {
        return Err(bad_request("仅买卖双方可提交仲裁材料"));
    }
    let public_text = body.public_text.trim();
    if public_text.is_empty() || public_text.len() > 8000 {
        return Err(bad_request("公开说明须 1–8000 字"));
    }
    if body.public_attachment_urls.len() > 7 {
        return Err(bad_request("公开凭证图最多 7 张"));
    }
    for u in &body.public_attachment_urls {
        if u.len() > 512 {
            return Err(bad_request("附件链接过长"));
        }
    }
    let private_trim = body.private_text.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if private_trim.map(|s| s.len()).unwrap_or(0) > 4000 {
        return Err(bad_request("仅仲裁员可见说明过长"));
    }
    let urls_json = serde_json::to_value(&body.public_attachment_urls)
        .map_err(|_| bad_request("附件列表格式无效"))?;
    let private_owned: Option<String> = private_trim.map(|s| s.to_string());
    let now = Utc::now().timestamp();
    state
        .db_service
        .upsert_escrow_dispute_submission(
            &escrow_pda,
            &pubkey,
            public_text,
            &urls_json,
            private_owned.as_deref(),
            now,
        )
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => bad_request("保存失败"),
            _ => AppError::from(e),
        })?;
    Ok(ok(json!({ "msg": "材料已保存" })))
}

/// GET /api/me/orders/:escrow_pda/dispute-submission — 买卖双方：对方条目仅公开区；本人条目含 private_text 便于核对
pub async fn get_dispute_submission_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
) -> HandlerResult {
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    let rows = state
        .db_service
        .list_escrow_dispute_submissions(&escrow_pda)
        .await?;
    let rev_rows = state
        .db_service
        .list_escrow_dispute_submission_revisions(&escrow_pda)
        .await?;
    let indexed = revision_rows_with_indices(rev_rows);
    let arb = is_arbitrator(&pubkey);
    let party = escrow.buyer == pubkey || escrow.seller == pubkey;
    if !arb && !party {
        return Err(bad_request("无权限查看"));
    }
    let pubkey_t = pubkey.trim();
    if arb {
        let revisions: Vec<Value> = indexed
            .iter()
            .map(|(r, i)| dispute_revision_json_value(r, *i, true))
            .collect();
        return Ok(ok(json!({ "submissions": rows, "revisions": revisions })));
    }
    // 对方材料仅公开区；本人提交的行附带 private_text，便于在站内核对己方填写
    let party_rows: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            let own = r.initiator.trim() == pubkey_t;
            if own {
                json!({
                    "escrow_pda": r.escrow_pda,
                    "initiator": r.initiator,
                    "public_text": r.public_text,
                    "public_attachment_urls": r.public_attachment_urls,
                    "private_text": r.private_text,
                    "created_at": r.created_at,
                })
            } else {
                json!({
                    "escrow_pda": r.escrow_pda,
                    "initiator": r.initiator,
                    "public_text": r.public_text,
                    "public_attachment_urls": r.public_attachment_urls,
                    "created_at": r.created_at,
                })
            }
        })
        .collect();
    let revisions: Vec<Value> = indexed
        .into_iter()
        .map(|(r, i)| {
            let own = r.initiator.trim() == pubkey_t;
            dispute_revision_json_value(&r, i, own)
        })
        .collect();
    Ok(ok(json!({ "submissions": party_rows, "revisions": revisions })))
}

/// GET /api/me/arbitration/escrows/:escrow_pda/briefing — 仲裁员：材料 + 托管流水 + 买卖双方聊天
pub async fn get_arbitration_briefing_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Path(escrow_pda): Path<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    if !is_arbitrator(&pubkey) {
        return Err(bad_request("仅仲裁员可查看案卷"));
    }
    let escrow = state
        .db_service
        .get_escrow(&escrow_pda)
        .await?
        .ok_or_else(|| bad_request("订单不存在"))?;
    if escrow.state != "Disputed" {
        return Err(bad_request("订单非仲裁中"));
    }
    let page = Page::new(1, q.page_size.unwrap_or(80).min(200).max(1));
    let events = state.db_service.list_escrow_events(&escrow_pda, &page).await?;
    // 私信与链上事件分页独立：案卷默认多拉站内上下文，仍设上限防拖垮
    let chat_page = Page::new(1, 200_i64);
    let messages = state
        .db_service
        .get_conversation(&escrow.buyer, &escrow.seller, &chat_page)
        .await?;
    let submissions = state
        .db_service
        .list_escrow_dispute_submissions(&escrow_pda)
        .await?;
    let rev_rows = state
        .db_service
        .list_escrow_dispute_submission_revisions(&escrow_pda)
        .await?;
    let dispute_revisions: Vec<Value> = revision_rows_with_indices(rev_rows)
        .into_iter()
        .map(|(r, i)| dispute_revision_json_value(&r, i, true))
        .collect();
    Ok(ok(json!({
        "escrow": escrow,
        "submissions": submissions,
        "revisions": dispute_revisions,
        "events": events,
        "messages": messages,
    })))
}
