use std::sync::Arc;
use axum::Router;
use crate::routers::protected::{ api_protected_router};
use crate::routers::public::{api_public_router,};
use crate::state::AppState;

//该模块专门处理路由
pub mod protected;
pub mod public;


pub fn api(state:AppState)->Router<AppState>{
    let sub_api=Router::merge(
        api_protected_router(state.clone()),
        api_public_router(state.clone())
    );
    Router::new()
        .nest("/api",sub_api)
}