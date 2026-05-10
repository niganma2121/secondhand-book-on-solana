use crate::db::DBService;
use tracing::warn;

pub struct EscrowSnapshot {
    pub escrow_pda: String,
    pub asset: String,
    pub seller: String,
    pub buyer: String,
    pub state: String,
}

pub async fn load_escrow_snapshot(db: &DBService, escrow_pda: &str) -> Option<EscrowSnapshot> {
    db.get_escrow(escrow_pda).await.ok().flatten().map(|x| EscrowSnapshot {
        escrow_pda: x.escrow_pda,
        asset: x.asset,
        seller: x.seller,
        buyer: x.buyer,
        state: x.state,
    })
}

pub async fn try_log_create_event(
    db: &DBService,
    escrow_pda: &str,
    asset: &str,
    seller: &str,
    buyer: &str,
    from_state: Option<&str>,
    tx_signature: &str,
    occurred_at: i64,
) {
    if let Err(e) = db
        .insert_escrow_event(
            escrow_pda,
            asset,
            seller,
            buyer,
            from_state,
            "Paid",
            "create_escrow",
            Some(tx_signature),
            Some(buyer),
            occurred_at,
        )
        .await
    {
        warn!("托管创建事件写入失败:{e}");
    }
}

pub async fn try_log_transition_event(
    db: &DBService,
    snapshot: &EscrowSnapshot,
    to_state: &str,
    action: &str,
    tx_signature: &str,
    actor_pubkey: Option<&str>,
    occurred_at: i64,
) {
    if let Err(e) = db
        .insert_escrow_event(
            &snapshot.escrow_pda,
            &snapshot.asset,
            &snapshot.seller,
            &snapshot.buyer,
            Some(&snapshot.state),
            to_state,
            action,
            Some(tx_signature),
            actor_pubkey,
            occurred_at,
        )
        .await
    {
        warn!("托管事件写入失败 action={} err={}", action, e);
    }
}
