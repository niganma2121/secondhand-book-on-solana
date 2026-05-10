use std::net::SocketAddr;
use axum::{serve, Router};
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderValue, Method};
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE};
use axum::serve::ListenerExt;
use dotenvy::{dotenv, var};
use tokio::net::TcpListener;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use book_server::{CORS_ORIGINS_ENV, PORT_ENV, SOLANA_WS_URL_ENV};
use book_server::state::AppState;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::info;
use book_server::reconcile::{listen_dispute_resolved, reconcile_loop};
use book_server::routers::api;

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let port=var(PORT_ENV).unwrap_or_else(|_|"3005".to_string());
    let addr:SocketAddr=format!("0.0.0.0:{}",port).parse().expect("无效的地址");

    let cors_origins_raw = var(CORS_ORIGINS_ENV).unwrap_or_else(|_| {
        "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
            .to_string()
    });
    let origin_list: Vec<HeaderValue> = cors_origins_raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.parse::<HeaderValue>()
                .unwrap_or_else(|_| panic!("无效的 {CORS_ORIGINS_ENV} 项: {s}"))
        })
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origin_list))
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION, COOKIE]);
    let state=AppState::new().await;
    let ws_url=var(SOLANA_WS_URL_ENV).expect("缺少Solana的ws url");

    //仲裁结果监听
    tokio::spawn(listen_dispute_resolved(
        state.db_service.clone(),
        ws_url
    ));
    tokio::spawn(reconcile_loop(
        state.db_service.clone(),
        state.anchor_service.as_ref().clone(),
    ));

    let app=Router::new()
        .merge(api(state.clone()))
        // create_book 会携带图片字节（JSON 数组，体积膨胀明显），
        // 先临时放宽到 120MB 以便高清图联调；后续建议改为 multipart + 压缩方案。
        .layer(DefaultBodyLimit::max(120 * 1024 * 1024))
        .layer(cors)
        .with_state(state);

    let tcp_listener=TcpListener::bind(addr).await.expect("监听器创建失败");
    let listener=tcp_listener.tap_io(|x| {
        info!("新的客户端接入:{:?}",x.peer_addr())
    });
    info!("服务器启动,开始监听端口:{}", port);
    serve(listener,app).await.expect("服务器创建失败");
}


