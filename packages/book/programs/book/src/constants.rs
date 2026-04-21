use anchor_lang::prelude::*;

/*种子部分*/

///书的种子
#[constant]
pub const BOOK_SEED:&[u8]=b"book";

///托管种子
#[constant]
pub const ESCROW_SEED:&[u8]=b"escrow";
///仲裁员
pub const ARBITRATORS:[Pubkey;3]=[
    Pubkey::from_str_const("A5JSJ3J184YKqB71dFG47XrmmxmZqTZRUah9udC4dsnZ"),
    Pubkey::from_str_const("CCiL4DCuzwKGSMYDDWA3E84XtNhsGc1SeWekNJvVF71j"),
    Pubkey::from_str_const("EKufV8XKB5QfX52xDbEjsYts8CHsiz8QihXCw9A6G6Fj")
];

pub const ADMIN_SIGNER:Pubkey=Pubkey::from_str_const("25K7f8hiKxutjL27CdrURYd4QbPKeAVogkLka8yyGyME");