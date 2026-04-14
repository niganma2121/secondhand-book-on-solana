use std::net::SocketAddr;
use std::sync::Arc;
use axum::{serve, Router};
use axum::routing::get;
use axum::serve::ListenerExt;
use dotenvy::{dotenv, var};
use log::info;
use book_server::routers::public::{ page_home};
use tokio::net::TcpListener;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use book_server::state::AppState;
use tower_http::cors::{Any, CorsLayer};
use book_server::routers::api;

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();
    let port=var("PORT").unwrap_or_else(|_|"3000".to_string());
    let addr:SocketAddr=format!("0.0.0.0:{}",port).parse().expect("无效的地址");

    let cors = CorsLayer::new()
        .allow_origin(Any) // 调试阶段允许所有来源
        .allow_methods(Any)
        .allow_headers(Any);
    let state=Arc::new(AppState::new().await);
    let app=Router::new()
        .route("/",get(page_home))
        .nest("/",api(state.clone()))
        .layer(cors)
        .with_state(state);

    let tcp_listener=TcpListener::bind(addr).await.expect("监听器创建失败");
    let listener=tcp_listener.tap_io(|x| {
        info!("新的连接接入:{:?}",x.peer_addr())
    });
    serve(listener,app).await.expect("服务器创建失败");
    info!("服务器启动,开始监听端口:3000")
}
