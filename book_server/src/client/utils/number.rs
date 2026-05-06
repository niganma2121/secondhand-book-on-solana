pub fn has_at_most_two_decimals(v: f64) -> bool {
    let scaled = v * 100.0;
    (scaled - scaled.round()).abs() < 1e-6
}
