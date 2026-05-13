pub fn has_at_most_two_decimals(v: f64) -> bool {
    let scaled = v * 100.0;
    (scaled - scaled.round()).abs() < 1e-6
}

/// 由链上 lamports 与汇率快照得到展示用人民币（两位小数），与 `book_handlers` 入库逻辑一致。
#[inline]
pub fn lamports_to_price_cny(price_lamports: u64, fx_cny_per_sol: f64) -> f64 {
    let sol = price_lamports as f64 / 1_000_000_000.0;
    (sol * fx_cny_per_sol * 100.0).round() / 100.0
}
