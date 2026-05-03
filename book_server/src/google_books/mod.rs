//! Google Books API v1 代理（需在环境变量配置 `GOOGLE_BOOKS_API_KEY`）
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

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

#[derive(Debug, Clone, serde::Serialize)]
pub struct GoogleBooksHit {
    pub volume_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub isbns: Vec<String>,
    pub cover_url: Option<String>,
    pub published_year: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum GoogleBooksError {
    #[error("未配置 GOOGLE_BOOKS_API_KEY")]
    MissingApiKey,
    #[error("Google Books 请求失败: {0}")]
    Upstream(String),
    #[error("解析响应失败: {0}")]
    Parse(String),
}

#[derive(Deserialize)]
struct VolumesResponse {
    #[serde(default)]
    items: Vec<VolumeItem>,
}

#[derive(Deserialize)]
struct VolumeItem {
    id: String,
    #[serde(rename = "volumeInfo")]
    volume_info: Option<VolumeInfo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VolumeInfo {
    title: Option<String>,
    #[serde(default)]
    authors: Vec<String>,
    #[serde(default)]
    industry_identifiers: Vec<IndustryIdentifier>,
    published_date: Option<String>,
    description: Option<String>,
    image_links: Option<ImageLinks>,
}

#[derive(Deserialize)]
struct IndustryIdentifier {
    #[serde(rename = "type")]
    id_type: String,
    identifier: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageLinks {
    extra_large: Option<String>,
    large: Option<String>,
    medium: Option<String>,
    small: Option<String>,
    thumbnail: Option<String>,
    small_thumbnail: Option<String>,
}

fn https_book_cover(links: &ImageLinks) -> Option<String> {
    let url = links
        .extra_large
        .as_ref()
        .or(links.large.as_ref())
        .or(links.medium.as_ref())
        .or(links.small.as_ref())
        .or(links.thumbnail.as_ref())
        .or(links.small_thumbnail.as_ref())?;
    Some(url.replace("http://", "https://"))
}

fn year_from_published(s: &Option<String>) -> Option<i64> {
    let s = s.as_ref()?.trim();
    if s.len() >= 4 {
        return s[..4].parse().ok();
    }
    None
}

fn collect_isbns(vi: &VolumeInfo) -> Vec<String> {
    let mut out = Vec::new();
    for id in &vi.industry_identifiers {
        let t = id.id_type.as_str();
        if t == "ISBN_13" || t == "ISBN_10" {
            let s = id.identifier.trim();
            if !s.is_empty() {
                out.push(s.to_string());
            }
        }
    }
    out
}

/// `q` 已 trim；`max_results` 1..=20
pub async fn search_volumes(api_key: &str, q: &str, max_results: u32) -> Result<Vec<GoogleBooksHit>, GoogleBooksError> {
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
            status,
            detail
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
        let cover_url = vi
            .image_links
            .as_ref()
            .and_then(|l| https_book_cover(l));

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
