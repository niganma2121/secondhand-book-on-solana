use super::types::{ImageLinks, VolumeInfo};

pub fn https_book_cover(links: &ImageLinks) -> Option<String> {
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

pub fn year_from_published(s: &Option<String>) -> Option<i64> {
    let s = s.as_ref()?.trim();
    if s.len() >= 4 {
        return s[..4].parse().ok();
    }
    None
}

pub fn collect_isbns(vi: &VolumeInfo) -> Vec<String> {
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
