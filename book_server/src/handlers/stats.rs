use crate::handlers::error::{HandlerResult, ok};
use crate::state::AppState;
use axum::extract::State;
use serde_json::json;

/// GET /api/stats/overview
pub async fn get_overview_stats_handler(State(state): State<AppState>) -> HandlerResult {
    let listed_books = state.db_service.count_listed_books().await?;
    let chain_transactions = state.db_service.count_released_escrows().await?;
    let registered_users = state.db_service.count_users().await?;
    let total_volume_lamports = state.db_service.sum_released_escrow_volume_lamports().await?;
    let total_volume_sol = total_volume_lamports as f64 / 1_000_000_000.0;

    Ok(ok(json!({
        "books_on_sale": listed_books,
        "chain_transactions": chain_transactions,
        "registered_users": registered_users,
        "total_volume_sol": total_volume_sol
    })))
}
