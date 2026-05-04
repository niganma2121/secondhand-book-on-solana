use serde::Deserialize;

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

#[derive(Deserialize)]
pub struct VolumesResponse {
    #[serde(default)]
    pub items: Vec<VolumeItem>,
}

#[derive(Deserialize)]
pub struct VolumeItem {
    pub id: String,
    #[serde(rename = "volumeInfo")]
    pub volume_info: Option<VolumeInfo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub title: Option<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub industry_identifiers: Vec<IndustryIdentifier>,
    pub published_date: Option<String>,
    pub description: Option<String>,
    pub image_links: Option<ImageLinks>,
}

#[derive(Deserialize)]
pub struct IndustryIdentifier {
    #[serde(rename = "type")]
    pub id_type: String,
    pub identifier: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageLinks {
    pub extra_large: Option<String>,
    pub large: Option<String>,
    pub medium: Option<String>,
    pub small: Option<String>,
    pub thumbnail: Option<String>,
    pub small_thumbnail: Option<String>,
}
