
pub const ADMIN_KEYPAIR_URL_ENV: &str = "ADMIN_KEYPAIR_URL";
pub const SOLANA_CLUSTER_ENV: &str = "SOLANA_CLUSTER";
pub const BOOK_COLLECTION_ENV: &str = "BOOK_COLLECTION";
pub const SOLANA_RPC_URL_ENV: &str = "SOLANA_RPC_URL";
pub const SOLANA_WS_URL_ENV: &str = "SOLANA_WS_URL";
pub const PORT_ENV: &str = "PORT";
pub const CORS_ORIGINS_ENV: &str = "CORS_ORIGINS";
pub const DATABASE_URL_ENV: &str = "DATABASE_URL";
pub const REDIS_URL_ENV: &str = "REDIS_URL";
pub const JWT_SECRET_ENV: &str = "JWT_SECRET";
pub const NONCE_SECRET_ENV: &str = "NONCE_SECRET";
pub const COOKIE_SECURE_ENV: &str = "COOKIE_SECURE";
pub const PINATA_API_KEY_ENV: &str = "PINATA_API_KEY";
pub const PINATA_SECRET_ENV: &str = "PINATA_SECRET";
pub const PINATA_JWT_ENV: &str = "PINATA_JWT";

pub const PINATA_URL: &str = "https://api.pinata.cloud/pinning/pinFileToIPFS";
pub const PINATA_GATEWAY_BASE_ENV: &str = "PINATA_GATEWAY_BASE";
pub const PINATA_GATEWAY_BASE_DEFAULT: &str = "https://gateway.pinata.cloud/ipfs";
pub const PINATA_HEADER_API_KEY: &str = "pinata_api_key";
pub const PINATA_HEADER_SECRET_KEY: &str = "pinata_secret_api_key";
pub const PINATA_HEADER_AUTHORIZATION: &str = "Authorization";
pub const PINATA_BEARER_PREFIX: &str = "Bearer ";
pub const PINATA_DEFAULT_IMAGE_MIME: &str = "image/jpeg";
pub const PINATA_METADATA_FILENAME: &str = "metadata.json";
pub const GOOGLE_BOOKS_API_KEY_ENV: &str = "GOOGLE_BOOKS_API_KEY";

/// 七牛云 AccessKey
pub const QINIU_ACCESS_KEY_ENV: &str = "QINIU_ACCESS_KEY";
/// 七牛云 SecretKey。
pub const QINIU_SECRET_KEY_ENV: &str = "QINIU_SECRET_KEY";
/// 存储空间名（bucket）。
pub const QINIU_BUCKET_ENV: &str = "QINIU_BUCKET";
///公有域名前缀
pub const QINIU_PUBLIC_BASE_ENV: &str = "QINIU_PUBLIC_BASE";

pub const QINIU_UPLOAD_HOST_ENV: &str = "QINIU_UPLOAD_HOST";

/// 新用户入库时的默认头像 URL
pub const DEFAULT_AVATAR_URL_ENV: &str = "DEFAULT_AVATAR_URL";

/// Pinata给前端的密钥的有效时间
pub const PINATA_SIGN_EXPIRES_SECS_ENV: &str = "PINATA_SIGN_EXPIRES_SECS";
/// 每用户每分钟最多请求几次
pub const RATE_LIMIT_PINATA_SIGN_PER_MIN_USER_ENV: &str = "RATE_LIMIT_PINATA_SIGN_PER_MIN_USER";
/// 每 IP 每分钟最多请求几次
pub const RATE_LIMIT_PINATA_SIGN_PER_MIN_IP_ENV: &str = "RATE_LIMIT_PINATA_SIGN_PER_MIN_IP";
/// 封面直传时 Pinata 最大字节数
pub const PINATA_SIGN_COVER_MAX_BYTES_ENV: &str = "PINATA_SIGN_COVER_MAX_BYTES";
/// 详情图直传时 Pinata 最大字节数
pub const PINATA_SIGN_DETAIL_MAX_BYTES_ENV: &str = "PINATA_SIGN_DETAIL_MAX_BYTES";

pub const PINATA_UPLOAD_SIGN_URL: &str = "https://uploads.pinata.cloud/v3/files/sign";

pub const BOOK_RECONCILE_INTERVAL_SECS_ENV:&str="BOOK_RECONCILE_INTERVAL_SECS";
/// 汇率缓存 
pub const SOL_CNY_RATE_CACHE_TTL_SECS_ENV: &str = "SOL_CNY_RATE_CACHE_TTL_SECS";

pub const SOL_CNY_RATE_FALLBACK_ENV: &str = "SOL_CNY_RATE_FALLBACK";