pub mod types;
pub mod error;
pub mod handler;
pub mod service;
pub mod utils;
pub use handler::*;
anchor_lang::declare_program!(book);
pub use book::{
    accounts::{Escrow,Book},
    constants::{ESCROW_SEED,BOOK_SEED},
    client::{
        accounts::*,
        args
    },
    ID
};
const MPL_CORE:&str="CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";