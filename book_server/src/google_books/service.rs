use std::sync::OnceLock;
use std::time::Duration;

use super::error::GoogleBooksError;
use super::parse::{collect_isbns, https_book_cover, year_from_published};
use super::types::{GoogleBooksHit, VolumesResponse};

static HTTP: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(25))
            .user_agent("solana-book-platform/1.0 (google-books-search)")
            .build()
            .expect("reqwest client for Google Books")
    })
}

/// 去空然后限制数量
pub async fn search_volumes(
    api_key: &str,
    q: &str,
    max_results: u32,
) -> Result<Vec<GoogleBooksHit>, GoogleBooksError> {
    if api_key.trim().is_empty() {
        return Err(GoogleBooksError::MissingApiKey);
    }
    let max_results = max_results.clamp(1, 20);
    let res = http_client()
        .get("https://www.googleapis.com/books/v1/volumes")
        .query(&[
            ("q", q),
            ("maxResults", &max_results.to_string()),
            ("key", api_key.trim()),
        ])
        .send()
        .await
        .map_err(|e| GoogleBooksError::Upstream(e.to_string()))?;

    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| GoogleBooksError::Upstream(e.to_string()))?;

    if !status.is_success() {
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("error")?.get("message")?.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| body.chars().take(200).collect());
        return Err(GoogleBooksError::Upstream(format!(
            "HTTP {} — {}",
            status, detail
        )));
    }

    let parsed: VolumesResponse =
        serde_json::from_str(&body).map_err(|e| GoogleBooksError::Parse(e.to_string()))?;

    let mut out = Vec::new();
    for item in parsed.items {
        let Some(vi) = item.volume_info else {
            continue;
        };
        let Some(title) = vi.title.clone().filter(|t| !t.trim().is_empty()) else {
            continue;
        };

        let isbns = collect_isbns(&vi);
        let cover_url = vi.image_links.as_ref().and_then(|l| https_book_cover(l));

        let description = vi
            .description
            .as_ref()
            .map(|s| {
                let t = s.trim();
                if t.len() > 4000 {
                    format!("{}…", &t[..4000])
                } else {
                    t.to_string()
                }
            })
            .filter(|s| !s.is_empty());
        let published_year = year_from_published(&vi.published_date);

        out.push(GoogleBooksHit {
            volume_id: item.id,
            title,
            authors: vi.authors,
            isbns,
            cover_url,
            published_year,
            description,
        });
    }

    Ok(out)
}
