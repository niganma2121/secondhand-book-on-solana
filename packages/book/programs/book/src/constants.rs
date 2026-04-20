use std::pin::Pin;
use std::str::FromStr;
use anchor_lang::prelude::*;

#[constant]
pub const SEED: &str = "anchor";

/*种子部分*/

///书的种子
#[constant]
pub const BOOK_SEED:&[u8]=b"book";

///托管种子
#[constant]
pub const ESCROW_SEED:&[u8]=b"escrow";

#[constant]
pub const ARBITRATORS:[Pubkey;3]=[
    Pubkey::from_str_const("A5JSJ3J184YKqB71dFG47XrmmxmZqTZRUah9udC4dsnZ"),
    Pubkey::from_str_const("A5JSJ3J184YKqB71dFG47XrmmxmZqTZRUah9udC4dsnZ"),
    Pubkey::from_str_const("A5JSJ3J184YKqB71dFG47XrmmxmZqTZRUah9udC4dsnZ")
];