use std::sync::Arc;

use tokio::sync::RwLock;

use crate::infra::env::{f64_env, u64_env};
use crate::{SOL_CNY_RATE_CACHE_TTL_SECS_ENV, SOL_CNY_RATE_FALLBACK_ENV};

/// 用于人民币和SOL汇率获取
fn is_valid_positive_rate(v: f64) -> bool {
    v.is_finite() && v > 0.0
}

#[derive(Debug, Clone)]
pub struct FxRateSnapshot {
    pub cny_per_sol: f64,
    pub source: String,
    pub updated_at: i64,
}

#[derive(Clone)]
pub struct FxRateService {
    client: reqwest::Client,
    cache: Arc<RwLock<Option<FxRateSnapshot>>>,
    cache_ttl_secs: u64,
    env_fallback: Option<f64>,
}

impl FxRateService {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .connect_timeout(std::time::Duration::from_secs(8))
            .build()
            .expect("failed to build reqwest client for fx rate");
        let cache_ttl_secs = u64_env(SOL_CNY_RATE_CACHE_TTL_SECS_ENV, 120).max(5);
        let env_fallback = f64_env(SOL_CNY_RATE_FALLBACK_ENV).filter(|x| is_valid_positive_rate(*x));
        Self {
            client,
            cache: Arc::new(RwLock::new(None)),
            cache_ttl_secs,
            env_fallback,
        }
    }

    async fn fetch_coingecko(&self) -> Result<f64, String> {
        let url = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=cny";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("coingecko request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("coingecko http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("coingecko parse failed: {e}"))?;
        let cny = body["solana"]["cny"]
            .as_f64()
            .ok_or_else(|| "coingecko payload missing solana.cny".to_string())?;
        if !is_valid_positive_rate(cny) {
            return Err(format!("coingecko invalid cny_per_sol: {cny}"));
        }
        Ok(cny)
    }

    async fn fetch_cryptocompare(&self) -> Result<f64, String> {
        let url = "https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=CNY";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("cryptocompare request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("cryptocompare http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("cryptocompare parse failed: {e}"))?;
        let cny = body["CNY"]
            .as_f64()
            .ok_or_else(|| "cryptocompare payload missing CNY".to_string())?;
        if !is_valid_positive_rate(cny) {
            return Err(format!("cryptocompare invalid cny_per_sol: {cny}"));
        }
        Ok(cny)
    }

    async fn fetch_sol_usd_kraken(&self) -> Result<f64, String> {
        let url = "https://api.kraken.com/0/public/Ticker?pair=SOLUSD";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("kraken request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("kraken http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("kraken parse failed: {e}"))?;
        let s = body["result"]["SOLUSD"]["c"][0]
            .as_str()
            .ok_or_else(|| "kraken missing SOLUSD last price".to_string())?;
        s.parse::<f64>()
            .map_err(|e| format!("kraken price parse: {e}"))
            .and_then(|v| {
                if is_valid_positive_rate(v) {
                    Ok(v)
                } else {
                    Err(format!("kraken invalid sol_usd: {v}"))
                }
            })
    }

    /// OKX 现货 SOL-USDT（USDT≈USD，用于交叉换算）
    async fn fetch_sol_usd_okx(&self) -> Result<f64, String> {
        let url = "https://www.okx.com/api/v5/market/ticker?instId=SOL-USDT";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("okx request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("okx http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("okx parse failed: {e}"))?;
        let last = body["data"][0]["last"]
            .as_str()
            .ok_or_else(|| "okx missing data[0].last".to_string())?;
        last.parse::<f64>()
            .map_err(|e| format!("okx last parse: {e}"))
            .and_then(|v| {
                if is_valid_positive_rate(v) {
                    Ok(v)
                } else {
                    Err(format!("okx invalid sol_usdt: {v}"))
                }
            })
    }

    async fn fetch_usd_cny_frankfurter(&self) -> Result<f64, String> {
        let url = "https://api.frankfurter.app/latest?from=USD&to=CNY";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("frankfurter request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("frankfurter http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("frankfurter parse failed: {e}"))?;
        let cny = body["rates"]["CNY"]
            .as_f64()
            .ok_or_else(|| "frankfurter missing rates.CNY".to_string())?;
        if !is_valid_positive_rate(cny) {
            return Err(format!("frankfurter invalid usd_cny: {cny}"));
        }
        Ok(cny)
    }

    /// Cloudflare Pages 上的开源汇率镜像（许多地区比 frankfurter 更易连通）
    async fn fetch_usd_cny_currency_pages(&self) -> Result<f64, String> {
        let url = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("currency-pages request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("currency-pages http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("currency-pages parse failed: {e}"))?;
        let cny = body["usd"]["cny"]
            .as_f64()
            .ok_or_else(|| "currency-pages missing usd.cny".to_string())?;
        if !is_valid_positive_rate(cny) {
            return Err(format!("currency-pages invalid usd_cny: {cny}"));
        }
        Ok(cny)
    }

    async fn fetch_usd_cny_er_api(&self) -> Result<f64, String> {
        let url = "https://open.er-api.com/v6/latest/USD";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("er-api request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("er-api http {}", resp.status()));
        }
        let body = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("er-api parse failed: {e}"))?;
        let cny = body["rates"]["CNY"]
            .as_f64()
            .ok_or_else(|| "er-api missing rates.CNY".to_string())?;
        if !is_valid_positive_rate(cny) {
            return Err(format!("er-api invalid usd_cny: {cny}"));
        }
        Ok(cny)
    }

    /// SOL/USD(USDT) × USD/CNY，两端各自多源回退（适配部分地区屏蔽 CoinGecko / 部分外汇站）
    async fn fetch_cross_sol_cny(&self) -> Result<(f64, String), String> {
        let (sol_src, sol_usd) = match self.fetch_sol_usd_kraken().await {
            Ok(v) => ("kraken", v),
            Err(e_k) => match self.fetch_sol_usd_okx().await {
                Ok(v) => ("okx", v),
                Err(e_o) => return Err(format!("sol_usd: kraken {e_k}; okx {e_o}")),
            },
        };

        let (fx_src, usd_cny) = match self.fetch_usd_cny_frankfurter().await {
            Ok(v) => ("frankfurter", v),
            Err(e_f) => match self.fetch_usd_cny_currency_pages().await {
                Ok(v) => ("currency_pages", v),
                Err(e_c) => match self.fetch_usd_cny_er_api().await {
                    Ok(v) => ("er_api", v),
                    Err(e_e) => {
                        return Err(format!(
                            "usd_cny: frankfurter {e_f}; currency_pages {e_c}; er_api {e_e}"
                        ))
                    }
                },
            },
        };

        let rate = sol_usd * usd_cny;
        if !is_valid_positive_rate(rate) {
            return Err(format!(
                "cross invalid cny_per_sol: sol_usd={sol_usd} usd_cny={usd_cny} -> {rate}"
            ));
        }
        Ok((rate, format!("cross_{sol_src}_{fx_src}")))
    }

    async fn fetch_remote_best_effort(&self) -> Result<(f64, String), String> {
        match self.fetch_coingecko().await {
            Ok(rate) => Ok((rate, "coingecko".into())),
            Err(e1) => match self.fetch_cross_sol_cny().await {
                Ok(pair) => Ok(pair),
                Err(e2) => match self.fetch_cryptocompare().await {
                    Ok(rate) => Ok((rate, "cryptocompare".into())),
                    Err(e3) => Err(format!(
                        "coingecko: {e1}; cross_rate: {e2}; cryptocompare: {e3}"
                    )),
                },
            },
        }
    }

    pub async fn get_sol_cny_rate(&self, force_refresh: bool) -> Result<FxRateSnapshot, String> {
        let now = chrono::Utc::now().timestamp();
        if !force_refresh {
            if let Some(cached) = self.cache.read().await.clone() {
                let age = now.saturating_sub(cached.updated_at);
                if age <= self.cache_ttl_secs as i64 {
                    return Ok(cached);
                }
            }
        }

        let fetched = self.fetch_remote_best_effort().await;

        match fetched {
            Ok((rate, source)) => {
                let fresh = FxRateSnapshot {
                    cny_per_sol: rate,
                    source,
                    updated_at: now,
                };
                *self.cache.write().await = Some(fresh.clone());
                Ok(fresh)
            }
            Err(fetch_err) => {
                if let Some(cached) = self.cache.read().await.clone() {
                    // 远端失败时允许返回过期缓存，保障业务连续性。
                    return Ok(FxRateSnapshot {
                        source: "cache_stale".into(),
                        ..cached
                    });
                }
                if let Some(fallback) = self.env_fallback {
                    return Ok(FxRateSnapshot {
                        cny_per_sol: fallback,
                        source: "env".into(),
                        updated_at: now,
                    });
                }
                Err(fetch_err)
            }
        }
    }
}
