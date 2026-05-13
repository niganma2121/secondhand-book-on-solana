use super::*;

/// 托管交易构建
impl AnchorService {
    pub async fn build_create_escrow(
        &self,
        req: CreateEscrowRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let buyer = parse(&req.buyer)?;
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::CreateEscrow {
                buyer,
                seller,
                book: book_pda,
                escrow: escrow_pda,
                asset,
                collection,
                mpl_core_program: MPL_CORE,
                system_program: SYSTEM_PROGRAM_ID,
            })
            .args(args::CreateEscrow {})
            .instructions()?;

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&buyer), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "使用钱包签名之后锁定订单".into(),
        })
    }

    pub async fn build_confirm_receipt(
        &self,
        req: ConfirmReceiptRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let buyer = parse(&req.buyer)?;
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let platform_fee_account = self.admin_keypair.pubkey();
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::ConfirmEscrow {
                buyer,
                seller,
                platform_fee_account,
                book: book_pda,
                escrow: escrow_pda,
                asset,
                collection,
                mpl_core_program: MPL_CORE,
                system_program: SYSTEM_PROGRAM_ID,
            })
            .args(args::ConfirmEscrow {})
            .instructions()?;

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&buyer), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "你将确认收书,请仔细检查书是否符合描述!!!".to_string(),
        })
    }

    pub async fn build_ship_book(
        &self,
        req: ShipBookRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::ShipBook {
                seller,
                escrow: escrow_pda,
            })
            .args(args::ShipBook {
                shipping_commitment: req.shipping_commitment,
            })
            .instructions()?;

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&seller), &block_hash);
        let tx = Transaction::new_unsigned(msg);
        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "请确保您已发货后进行签名,该操作无法撤销".into(),
        })
    }

    pub async fn build_cancel_escrow(
        &self,
        req: CancelEscrowRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let signer = parse(&req.signer)?;
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::CancelEscrow {
                signer,
                buyer,
                escrow: escrow_pda,
                book: book_pda,
                asset,
                collection,
                mpl_core_program: MPL_CORE,
                system_program: SYSTEM_PROGRAM_ID,
            })
            .args(args::CancelEscrow {})
            .instructions()?;

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&signer), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "使用钱包签名以取消该笔订单".into(),
        })
    }

    pub async fn build_set_pre_ship_lock(
        &self,
        req: SetPreShipLockRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::SetPreShipLock {
                seller,
                buyer,
                escrow: escrow_pda,
            })
            .args(args::SetPreShipLock {})
            .instructions()?;

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&seller), &block_hash);
        let tx = Transaction::new_unsigned(msg);
        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "使用钱包签名以锁单备发货（链上生效，买家将不可取消托管）".into(),
        })
    }

    pub async fn build_open_dispute(
        &self,
        req: OpenDisputeRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let signer = parse(&req.signer)?;
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::OpenDispute {
                signer,
                escrow: escrow_pda,
            })
            .args(args::OpenDispute {})
            .instructions()?;

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&signer), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "请用钱包签名发起仲裁".into(),
        })
    }

    pub async fn build_resolve_dispute(
        &self,
        req: ResolveDisputeRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let arbitrator = parse(&req.arbitrator)?;
        let buyer = parse(&req.buyer)?;
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let admin = self.admin_keypair.pubkey();
        let book_pda = self.book_pda(&asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let choice = match req.choice {
            1 => VoteChoice::Buyer,
            2 => VoteChoice::Seller,
            _ => return Err(ClientError::BadChoice),
        };

        let ix = program
            .request()
            .accounts(accounts::ResolveDispute {
                arbitrator,
                admin_signer: admin,
                escrow: escrow_pda,
                book: book_pda,
                buyer,
                seller,
                asset,
                collection,
                mpl_core_program: MPL_CORE,
                system_program: SYSTEM_PROGRAM_ID,
            })
            .args(args::ResolveDispute {
                choice,
                refund_amount: req.refund_amount,
                return_book: req.return_book,
            })
            .instructions()?;
        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&arbitrator), &block_hash);
        let mut tx = Transaction::new_unsigned(msg);
        tx.partial_sign(&[self.admin_keypair.as_ref()], block_hash);
        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "投票成功".into(),
        })
    }
}