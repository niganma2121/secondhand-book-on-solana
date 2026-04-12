use std::net::SocketAddr;
use std::str::FromStr;
use axum::{serve, Router};
use axum::routing::get;
use axum::serve::ListenerExt;
use dotenvy::{dotenv, var};
use book_server::routers::page_home;
use tokio::net::TcpListener;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();
    let port=var("PORT").unwrap_or_else(|_|"3000".to_string());
    let addr:SocketAddr=format!("0.0.0.0:{}",port).parse().expect("无效的地址");

    let app=Router::new()
        .route("/",get(page_home));
    let tcp_listener=TcpListener::bind(addr).await.expect("监听器创建失败");
    let listener=tcp_listener.tap_io(|x| {
       println!("有新的地址接入{:?}",x.peer_addr());
    });
    serve(listener,app).await.expect("服务器创建失败");
    println!("开始监听地址127.0.0.1:3000")
}
