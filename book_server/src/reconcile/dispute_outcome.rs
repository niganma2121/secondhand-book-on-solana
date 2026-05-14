use crate::client::{ArbitrationResult, Escrow};

/// 链上托管已 `Released` 且 `dispute` 已记最终票型时，取出裁决结果（用于写 `escrow_events.resolve_dispute`）。
pub fn released_arbitration_outcome(escrow: &Escrow) -> Option<(ArbitrationResult, bool, u64)> {
    let d = escrow.dispute.as_ref()?;
    match d.arb_res {
        ArbitrationResult::Voting => None,
        ArbitrationResult::BuyerWin | ArbitrationResult::SellerWin => {
            Some((d.arb_res, d.return_book, d.refund_amount))
        }
    }
}
