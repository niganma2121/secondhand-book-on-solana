use anchor_client::Hash;
use anchor_lang::prelude::Pubkey;
use crate::client::{BOOK_SEED, ESCROW_SEED};
use crate::client::error::ClientError;
use crate::client::types::AnchorService;

impl AnchorService{
    //获取PDA
    fn book_pda(&self,seller:&Pubkey,asset:&Pubkey)->Pubkey{
        Pubkey::find_program_address(
            &[BOOK_SEED,seller.as_ref(),asset.as_ref()],
            &Pubkey::from(self.program_id.to_bytes())
        ).0
    }

    fn escrow_pda(&self,buyer:&Pubkey,book:&Pubkey)->Pubkey{
        Pubkey::find_program_address(
            &[ESCROW_SEED,buyer.as_ref(),book.as_ref()],
            &Pubkey::from(self.program_id.to_bytes())
        ).0
    }

    async fn get_blockhash(&self)->Result<Hash,ClientError>{
        self.get_program()?
            .rpc()
            .get_latest_blockhash()
            .await
            .map_err(|e|ClientError::BlockError(e.to_string()))
    }


}