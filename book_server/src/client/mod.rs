pub mod types;
pub mod error;
pub mod handler;
pub mod service;
pub mod utils;
pub use handler::*;
use anchor_client::anchor_lang::*;
use anchor_lang::prelude::Pubkey;

declare_program!(book);
pub use book::{
    accounts::{Escrow,Book},
    constants::{ESCROW_SEED,BOOK_SEED},
    client::{
        accounts,
        args
    },
    types::{VoteChoice},
    ID as BOOK_PROGRAM_ID
};
const MPL_CORE:Pubkey=Pubkey::from_str_const("CoRE9aCUEv7WzZ6EUt2C9pcz7moCCWf999fMey9vR7T");
