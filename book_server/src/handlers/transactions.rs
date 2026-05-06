use crate::handlers::me::PageQuery;
use crate::handlers::error::{HandlerResult, ok};
use crate::state::AppState;
use crate::db::types::EscrowActivityRow;
use axum::extract::{Query, State};
use axum::Extension;
use serde_json::{json, Value};

fn map_escrow_state_to_tx_status(state: &str) -> &'static str {
    match state {
        "Released" => "confirmed",
        "Cancelled" => "failed",
        _ => "processing",
    }
}

fn escrow_activity_to_json(row: &EscrowActivityRow) -> Value {
    let amount_sol = row.price as f64 / 1_000_000_000.0;
    let ts = chrono::DateTime::from_timestamp(row.created_at, 0)
        .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| row.created_at.to_string());

    json!({
        "signature": row.escrow_pda,
        "type": "buy",
        "bookTitle": row.book_name,
        "bookCover": row.cover_url,
        "amount": amount_sol,
        "from": row.buyer,
        "to": row.seller,
        "timestamp": ts,
        "status": map_escrow_state_to_tx_status(&row.state),
        "slot": 0,
        "fee": 5000,
        "transactionLinkKind": "account",
    })
}

/// GET /api/transactions — 本程序相关的托管订单（数据库镜像，Explorer 指向托管账户）
pub async fn list_program_transactions_handler(
    State(state): State<AppState>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let rows = state.db_service.list_escrow_activity_global(&page).await?;
    let transactions: Vec<Value> = rows.iter().map(escrow_activity_to_json).collect();
    Ok(ok(json!({ "transactions": transactions })))
}

/// GET /api/me/transactions — 当前用户作为买方或卖方参与的托管订单
pub async fn list_my_transactions_handler(
    State(state): State<AppState>,
    Extension(pubkey): Extension<String>,
    Query(q): Query<PageQuery>,
) -> HandlerResult {
    let page = q.to_page();
    let rows = state
        .db_service
        .list_escrow_activity_for_user(&pubkey, &page)
        .await?;
    let transactions: Vec<Value> = rows.iter().map(escrow_activity_to_json).collect();
    Ok(ok(json!({ "transactions": transactions })))
}
