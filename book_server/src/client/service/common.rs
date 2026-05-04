use super::*;

impl AnchorService {
    // 构建URL
    pub(crate) fn ipfs_gateway_url(&self, cid: &str) -> String {
        let base = self.pinata_gateway_base.trim_end_matches('/');
        format!("{base}/{cid}")
    }

    // 获取PDA
    pub(crate) fn book_pda(&self, seller: &Pubkey, asset: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[BOOK_SEED, seller.as_ref(), asset.as_ref()],
            &Pubkey::from(self.program_id.to_bytes()),
        )
        .0
    }

    pub(crate) fn escrow_pda(&self, buyer: &Pubkey, book: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[ESCROW_SEED, buyer.as_ref(), book.as_ref()],
            &Pubkey::from(self.program_id.to_bytes()),
        )
        .0
    }

    pub(crate) async fn get_blockhash(&self) -> Result<Hash, ClientError> {
        self.get_program()?
            .rpc()
            .get_latest_blockhash()
            .await
            .map_err(|e| ClientError::BlockError(e.to_string()))
    }
}
