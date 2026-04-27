pub mod error;
pub mod handler;
pub mod service;
pub mod types;
pub mod utils;
use anchor_client::anchor_lang::*;
use anchor_lang::prelude::Pubkey;
pub use handler::*;

declare_program!(book);
pub use book::{
    ID as BOOK_PROGRAM_ID,
    accounts::{Book, Escrow},
    client::{accounts, args},
    constants::{BOOK_SEED, ESCROW_SEED},
    events::DisputeResolvedEvent,
    types::{ArbitrationResult, BookStatus, EscrowState, VoteChoice},
};
const MPL_CORE: Pubkey = Pubkey::from_str_const("CoRE9aCUEv7WzZ6EUt2C9pcz7moCCWf999fMey9vR7T");
