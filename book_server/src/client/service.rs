use super::{BOOK_SEED, ESCROW_SEED, MPL_CORE, VoteChoice, accounts, args};
use crate::client::error::ClientError;
use crate::client::types::{
    AnchorService, BroadcastCancelEscrowRequest, BroadcastConfirmReceiptRequest,
    BroadcastCreateBookRequest, BroadcastCreateEscrowRequest, BroadcastDelistRequest,
    BroadcastOpenDisputeRequest, BroadcastResolveDisputeRequest, BroadcastResponse, BroadcastShipRequest,
    BroadcastUpdatePriceRequest, CancelEscrowRequest, ConfirmReceiptRequest, CreateBookBuildTxRequest,
    CreateBookMetadataDetailItem, CreateBookMetadataRequest, CreateBookMetadataResponse,
    CreateBookRequest, CreateBookTxResponse, CreateBookUploadImageResponse, CreateEscrowRequest,
    DelistBookRequest, InitCollectionRequest,
    InitCollectionResponse, OpenDisputeRequest, ResolveDisputeRequest, ShipBookRequest,
    SignedTxRequest, UnsignedTxResponse, UpdatePriceRequest,
};
use crate::client::utils::{
    deserialize_signed_tx, hash_json, parse, resolve_image_mime_type, serialize_tx,
    tx_primary_signature, upload_json_to_ipfs, upload_to_ipfs,
};
use crate::db::DBService;
use anchor_client::anchor_lang::prelude::Pubkey;
use anchor_client::solana_sdk::hash::Hash;
use anchor_client::solana_sdk::message::Message;
use anchor_client::solana_sdk::signature::{Keypair, Signer};
use anchor_client::solana_sdk::transaction::Transaction;
use mpl_core::instructions::{BurnV1Builder, CreateCollectionV1Builder, CreateV1Builder};
use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;
use sonyflake::Sonyflake;
use tracing::{info, warn};

///工具部分
impl AnchorService {
    //构建URL
    fn ipfs_gateway_url(&self, cid: &str) -> String {
        let base = self.pinata_gateway_base.trim_end_matches('/');
        format!("{base}/{cid}")
    }

    //获取PDA
    fn book_pda(&self, seller: &Pubkey, asset: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[BOOK_SEED, seller.as_ref(), asset.as_ref()],
            &Pubkey::from(self.program_id.to_bytes()),
        )
        .0
    }
    
    fn escrow_pda(&self, buyer: &Pubkey, book: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[ESCROW_SEED, buyer.as_ref(), book.as_ref()],
            &Pubkey::from(self.program_id.to_bytes()),
        )
        .0
    }

    async fn get_blockhash(&self) -> Result<Hash, ClientError> {
        self.get_program()?
            .rpc()
            .get_latest_blockhash()
            .await
            .map_err(|e| ClientError::BlockError(e.to_string()))
    }
}

///Book交易构建
impl AnchorService {
    /// 初始化一个全新的 MPL Core collection（平台默认 collection）。
    /// 等等后面在开发网上创建collection
    pub async fn init_default_collection(
        &self,
        req: InitCollectionRequest,
    ) -> Result<InitCollectionResponse, ClientError> {
        let name = req.name.trim();
        let uri = req.uri.trim();
        if name.is_empty() || uri.is_empty() {
            return Err(ClientError::TxBuildError(
                "collection name/uri 不能为空".into(),
            ));
        }

        let collection_keypair = Keypair::new();
        let collection_pubkey = collection_keypair.pubkey();
        let admin = self.admin_keypair.pubkey();

        let ix = CreateCollectionV1Builder::new()
            .collection(collection_pubkey)
            .update_authority(Some(admin))
            .payer(admin)
            .name(name.to_string())
            .uri(uri.to_string())
            .instruction();

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(&[ix], Some(&admin), &block_hash);
        let mut tx = Transaction::new_unsigned(msg);
        tx.partial_sign(&[self.admin_keypair.as_ref(), &collection_keypair], block_hash);

        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;

        Ok(InitCollectionResponse {
            collection: collection_pubkey.to_string(),
            signature: sig.to_string(),
            msg: "collection 创建成功".into(),
        })
    }

    /// 分步上架：单张图片上传到 Pinata（封面或详情）。
    pub async fn upload_create_book_image(
        &self,
        bytes: Vec<u8>,
        filename: String,
        mime_type: Option<String>,
    ) -> Result<CreateBookUploadImageResponse, ClientError> {
        let mime = resolve_image_mime_type(mime_type.as_deref(), filename.as_str(), bytes.as_slice())?;
        let cid = upload_to_ipfs(
            bytes,
            filename,
            Some(mime.as_str()),
            self.pinata_jwt.as_deref(),
            self.pinata_api_key.as_deref(),
            self.pinata_secret.as_deref(),
        )
        .await?;
        let url = self.ipfs_gateway_url(&cid);
        info!("[create_book] image uploaded cid={}", cid);
        Ok(CreateBookUploadImageResponse {
            cid,
            url,
            mime_type: mime,
            msg: "上传成功".into(),
        })
    }

    /// 分步上架：上传 JSON 元数据到 IPFS。
    pub async fn create_book_metadata_step(
        &self,
        req: CreateBookMetadataRequest,
    ) -> Result<CreateBookMetadataResponse, ClientError> {
        info!(
            "[create_book] metadata start seller={} title={}",
            req.seller, req.name
        );
        let metadata = serde_json::json!({
            "name": req.name,
            "description": req.description,
            "image": req.cover_url,
            "attributes": [
                {"trait_type": "condition", "value": req.condition},
                {"trait_type": "seller", "value": req.seller},
            ],
            "properties": {
                "files": req.details.iter().map(|d| serde_json::json!({
                    "uri": d.url,
                    "type": d.mime_type
                })).collect::<Vec<_>>()
            }
        });
        let metadata_cid = upload_json_to_ipfs(
            &metadata,
            self.pinata_jwt.as_deref(),
            self.pinata_api_key.as_deref(),
            self.pinata_secret.as_deref(),
        )
        .await?;
        let metadata_url = self.ipfs_gateway_url(&metadata_cid);
        let hash = hash_json(&metadata);
        info!("[create_book] metadata uploaded cid={}", metadata_cid);
        Ok(CreateBookMetadataResponse {
            metadata_cid,
            metadata_url,
            metadata_hash: hash.to_vec(),
            msg: "元数据已上传".into(),
        })
    }

    /// 分步上架：仅组装并 partial_sign 创建书籍交易（无图片上传）。
        pub async fn build_create_book_tx_only(
        &self,
        req: CreateBookBuildTxRequest,
    ) -> Result<CreateBookTxResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let collection = self.book_collection;
        if req.metadata_hash.len() != 32 {
            return Err(ClientError::TxBuildError(
                "metadata_hash 长度须为 32 字节".into(),
            ));
        }
        let mut hash_arr = [0u8; 32];
        hash_arr.copy_from_slice(&req.metadata_hash);
        let metadata_cid = req.metadata_cid.clone();
        let metadata_url = req.metadata_url.clone();
        info!(
            "[create_book] build_tx start seller={} title={} metadata_cid={}",
            req.seller, req.name, metadata_cid
        );

        let asset_keypair = Keypair::new();
        let asset_pubkey = asset_keypair.pubkey();
        let book_pda = self.book_pda(&seller, &asset_pubkey);
        let program = self.get_program()?;
        let admin_pk = self.admin_keypair.pubkey();
        let mint_ix = CreateV1Builder::new()
            .asset(asset_pubkey)
            .collection(Some(collection))
            .authority(Some(admin_pk))
            .payer(seller)
            .owner(Some(seller))
            .name(req.name.clone())
            .uri(metadata_url)
            .instruction();
        let create_ix = program
            .request()
            .accounts(accounts::CreateBook {
                seller,
                admin: self.admin_keypair.pubkey(),
                book: book_pda,
                asset: asset_pubkey,
                system_program: SYSTEM_PROGRAM_ID,
            })
            .args(args::CreateBook {
                price: req.price,
                metadata_id: metadata_cid,
                metadata_hash: hash_arr,
            })
            .instructions()?;
        let mut all_ix = vec![mint_ix];
        all_ix.extend(create_ix);
        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(&all_ix, Some(&seller), &block_hash);
        let mut tx = Transaction::new_unsigned(msg);
        tx.partial_sign(&[&self.admin_keypair, &asset_keypair], block_hash);
        info!(
            "[create_book] build done seller={} asset={} book_pda={}",
            req.seller, asset_pubkey, book_pda
        );
        Ok(CreateBookTxResponse {
            tx: serialize_tx(&tx)?,
            asset: asset_pubkey.to_string(),
            book_pda: book_pda.to_string(),
            msg: "书籍构造成功，签名后以上架书籍".into(),
            cover_url: req.cover_url,
            detail_urls: req.detail_urls,
            metadata_url: req.metadata_url,
            metadata_hash: req.metadata_hash,
        })
    }

    /// 一步式上架：上传 → metadata → 组交易 与分步接口共享逻辑。
    /// 暂时保留,不修改,,,兼容一下把
    pub async fn build_create_book(
        &self,
        req: CreateBookRequest,
    ) -> Result<CreateBookTxResponse, ClientError> {
        info!(
            "[create_book] build (monolithic) start seller={} title={} details={}",
            req.seller,
            req.name,
            req.detail_images.len()
        );
        let cover = self
            .upload_create_book_image(
                req.cover_image,
                req.cover_filename,
                req.cover_mime_type,
            )
            .await?;
        let cover_url = cover.url.clone();
        let mut detail_urls: Vec<String> = Vec::new();
        let mut details = Vec::new();
        for image in req.detail_images {
            let r = self
                .upload_create_book_image(image.bytes, image.filename, image.mime_type)
                .await?;
            detail_urls.push(r.url.clone());
            details.push(CreateBookMetadataDetailItem {
                url: r.url,
                mime_type: r.mime_type,
            });
        }
        let meta = self
            .create_book_metadata_step(CreateBookMetadataRequest {
                seller: req.seller.clone(),
                name: req.name.clone(),
                description: req.description,
                condition: req.condition.clone(),
                cover_url,
                details,
            })
            .await?;
        self.build_create_book_tx_only(CreateBookBuildTxRequest {
            seller: req.seller,
            name: req.name,
            price: req.price,
            cover_url: cover.url,
            detail_urls,
            metadata_cid: meta.metadata_cid,
            metadata_url: meta.metadata_url,
            metadata_hash: meta.metadata_hash,
        })
        .await
    }


    pub async fn build_delist_book(
        &self,
        req: DelistBookRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let book_pda = self.book_pda(&seller, &asset);
        let program = self.get_program()?;

        let delist_ix = program
            .request()
            .accounts(accounts::DelistBook {
                seller,
                book: book_pda,
            })
            .args(args::DelistBook {})
            .instructions()?;
        let burn_ix = BurnV1Builder::new()
            .asset(asset)
            .collection(Some(collection))
            .payer(seller)
            .instruction();
        let mut all_ix = delist_ix;
        all_ix.push(burn_ix);

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(all_ix.as_ref(), Some(&seller), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "使用钱包签名以下架书籍".into(),
        })
    }

    pub async fn build_update_price(
        &self,
        req: UpdatePriceRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&seller, &asset);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::UpdateBookPrice {
                seller,
                book: book_pda,
            })
            .args(args::UpdateBookPrice {
                new_price: req.new_price,
            })
            .instructions()?;
        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&seller), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "".to_string(),
        })
    }
}

///Book广播部分
impl AnchorService {
    //接受创建书的签名后处理
    pub async fn broadcast_create_book(
        &self,
        req: BroadcastCreateBookRequest,
        db: &DBService,
        id_generator:&Sonyflake,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        info!(
            "[create_book] broadcast start asset={} seller={}",
            req.asset, req.seller
        );
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let rpc = self.get_program()?.rpc();
        let send_result = rpc.send_and_confirm_transaction(&tx).await;
        let sig = match send_result {
            Ok(s) => s,
            Err(e) => {
                let err_s = e.to_string();
                // 重复提交同一笔已上链交易时 RPC 会报已处理，按幂等成功处理并补入库。
                if err_s.contains("already been processed") {
                    let recovered = tx_primary_signature(&tx).map_err(|ie| {
                        warn!(
                            "[create_book] duplicate tx but no signature asset={} seller={} err={}",
                            req.asset, req.seller, ie
                        );
                        ie
                    })?;
                    info!(
                        "[create_book] broadcast idempotent (链上已存在) asset={} sig={}",
                        req.asset, recovered
                    );
                    recovered
                } else {
                    warn!(
                        "[create_book] broadcast failed asset={} seller={} err={}",
                        req.asset, req.seller, err_s
                    );
                    return Err(ClientError::BroadcastFailed(err_s));
                }
            }
        };
        info!(
            "[create_book] broadcast confirmed asset={} sig={}",
            req.asset, sig
        );

        // 广播成功，写书籍主表
        let collection = self.book_collection.to_string();
        if let Err(e) = db
            .insert_book(
                &req.asset,
                &req.book_pda,
                &req.seller,
                &collection,
                req.price as i64,
                &req.metadata_url,
                &req.metadata_hash,
                &req.name,
                Some(req.cover_url.as_str()),
                req.author.as_deref(),
                req.series.as_deref(),
                &req.category,
                &req.condition,
                now,
            )
            .await
        {
            warn!("创建书成功广播,数据库内部错误:{e}");
        }

        // 写图片表，sort 按顺序编号
        if !req.detail_urls.is_empty() {
            let mut images: Vec<(i64, &str, &str, i16, i64)> = Vec::new();
            for (i, url) in req.detail_urls.iter().enumerate() {
                let id = id_generator
                    .next_id()
                    .map_err(|e| ClientError::DbError(e.to_string()))? as i64;
                images.push((id, req.asset.as_str(), url.as_str(), i as i16, now));
            }
            if let Err(e) = db.insert_book_images(&images).await {
                warn!("图片入库失败: {e}");
            }
        }
        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "书籍已上链并入库".into(),
        })
    }

    //接受下架签名后处理广播
    pub async fn broadcast_delist_book(
        &self,
        req: BroadcastDelistRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;

        if let Err(e) = db.update_book_status(&req.asset, "Delisted", now).await {
            warn!("书籍下架成功,数据库更新失败:{e}")
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "书籍下架成功".to_string(),
        })
    }

    pub async fn broadcast_update_price(
        &self,
        req: BroadcastUpdatePriceRequest,
        db: &DBService,
        now: i64,
    ) -> Result<BroadcastResponse, ClientError> {
        let tx = deserialize_signed_tx(&req.signed_tx)?;
        let sig = self
            .get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e| ClientError::BroadcastFailed(e.to_string()))?;

        if let Err(e) = db
            .update_book_price(&req.asset, req.new_price as i64, now)
            .await
        {
            warn!("书籍价格更新成功,数据库错误:{e}");
        }

        Ok(BroadcastResponse {
            signature: sig.to_string(),
            msg: "价格已经更新".into(),
        })
    }
}

///托管部分
impl AnchorService {
    pub async fn build_create_escrow(
        &self,
        req: CreateEscrowRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let buyer = parse(&req.buyer)?;
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let book_pda = self.book_pda(&seller, &asset);
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
        let book_pda = self.book_pda(&seller, &asset);
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
        let book_pda = self.book_pda(&seller, &asset);
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
        let seller = parse(&req.seller)?;
        let buyer = parse(&req.buyer)?;
        let asset = parse(&req.asset)?;
        let collection = parse(&req.collection)?;
        let admin = self.admin_keypair.pubkey();
        let book_pda = self.book_pda(&seller, &asset);
        let escrow_pda = self.escrow_pda(&buyer, &book_pda);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::CancelEscrow {
                signer,
                buyer,
                admin_signer: admin,
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
        let mut tx = Transaction::new_unsigned(msg);

        //后端密钥对签名
        tx.partial_sign(&[self.admin_keypair.as_ref()], block_hash);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "使用钱包签名以取消该笔订单".into(),
        })
    }
    pub async fn build_open_dispute(
        &self,
        req: OpenDisputeRequest,
    ) -> Result<UnsignedTxResponse, ClientError> {
        let signer = parse(&req.signer)?;
        let buyer = parse(&req.buyer)?;
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&seller, &asset);
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
        let book_pda = self.book_pda(&seller, &asset);
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

        // 后端先签 admin 部分，仲裁员补签后广播
        tx.partial_sign(&[self.admin_keypair.as_ref()], block_hash);
        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "投票成功".into(),
        })
    }
}

///托管广播部分
impl AnchorService {
    //广播购买成功
    pub async fn broadcast_create_escrow(
        &self,
        req:BroadcastCreateEscrowRequest,
        db:&DBService,
        now:i64
    )->Result<BroadcastResponse,ClientError>{
        let tx=deserialize_signed_tx(&req.signed_tx)?;
        let sig=self.get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e|ClientError::BroadcastFailed(e.to_string()))?;

        //创建托管
        if let Err(e)=db.insert_escrow(
            &req.escrow_pda,
            &req.asset,
            &req.seller,
            &req.buyer,
            req.price as i64,
            now,
        ).await{
            warn!("托管创建成功,数据库错误:{e}");
        }

        //更新书的状态
        if let Err(e)=db.update_book_status(
            &req.asset,
            "LOCKED",
            now
        ).await{
            warn!("数据库书籍状态更新失败:{e}")
        }
        Ok(BroadcastResponse{
            signature:sig.to_string(),
            msg:"购买成功,书籍已锁定".into()
        })
    }

    pub async fn broadcast_ship_book(
        &self,
        req:BroadcastShipRequest,
        db:&DBService,
        now:i64
    )->Result<BroadcastResponse,ClientError>{
        let tx=deserialize_signed_tx(&req.signed_tx)?;
        let sig=self.get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e|ClientError::BroadcastFailed(e.to_string()))?;

        if let Err(e)=db.update_escrow_shipped(&req.escrow_pda,&req.shipping_commitment,now).await{
            warn!("数据库错误,更新内部的ship状态错误:{e}")
        }
        Ok(BroadcastResponse{
            signature:sig.to_string(),
            msg:"发货消息已提交".into()
        })
    }

    pub async fn broadcast_confirm_receipt(
        &self,
        req:BroadcastConfirmReceiptRequest,
        db:&DBService,
        now:i64
    )->Result<BroadcastResponse,ClientError>{
        let tx=deserialize_signed_tx(&req.signed_tx)?;
        let sig=self.get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e|ClientError::BroadcastFailed(e.to_string()))?;
        //更新escrow状态
        if let Err(e)=db.update_escrow_state(
            &req.asset,
            "Completed",
            now
        ).await{
            warn!("数据库:更新托管状态出错:{e}");
        }
        //更新书籍状态
        if let Err(e)=db.update_book_status(
            &req.asset,
            "Sold",
            now
        ).await{
            warn!("数据库:更新书籍状态出错:{e}");
        }
        //
        if let Err(e)=db.increment_trade_counts(
            &req.seller,
            &req.buyer
        ).await{
            warn!("数据库:增加交易信息出错:{e}");
        }

        Ok(BroadcastResponse{
            signature:sig.to_string(),
            msg:"确认收获成功".into()
        })

    }

    pub async fn broadcast_cancel_escrow(
        &self,
        req:BroadcastCancelEscrowRequest,
        db:&DBService,
        now:i64
    )->Result<BroadcastResponse,ClientError>{
        let tx=deserialize_signed_tx(&req.signed_tx)?;
        let sig=self.get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e|ClientError::BroadcastFailed(e.to_string()))?;

        if let Err(e)=db.update_escrow_state(
            &req.escrow_pda,
            "Canceled",
            now
        ).await{
            warn!("数据库:更新托管状态失败:{e}")
        }

        if let Err(e)=db.update_book_status(
            &req.escrow_pda,
            "Listed",
            now
        ).await{
            warn!("数据库:更新书籍状态失败:{e}")
        }

        Ok(BroadcastResponse{
            signature:sig.to_string(),
            msg:"取消交易成功".into()
        })
    }

    pub async fn broadcast_open_dispute(
        &self,
        req:BroadcastOpenDisputeRequest,
        db:&DBService,
        now:i64
    )->Result<BroadcastResponse,ClientError>{
        let tx=deserialize_signed_tx(&req.signed_tx)?;
        let sig=self.get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e|ClientError::BroadcastFailed(e.to_string()))?;
        if let Err(e)=db.update_escrow_state(
            &req.escrow_pda,
            "Disputed",
            now
        ).await{
            warn!("数据库:更新托管状态错误:{e}")
        }

        Ok(BroadcastResponse{
            signature:sig.to_string(),
            msg:"仲裁发起成功,等待仲裁员投票".into()
        })
    }

    pub async fn broadcast_resolve_dispute(
        &self,
        req:BroadcastResolveDisputeRequest,
        now:i64
    )->Result<BroadcastResponse,ClientError>{
        let tx=deserialize_signed_tx(&req.signed_tx)?;
        let sig=self.get_program()?
            .rpc()
            .send_and_confirm_transaction(&tx)
            .await
            .map_err(|e|ClientError::BroadcastFailed(e.to_string()))?;

        info!("仲裁投票已广播 escrow={} sig={},time:{}", req.escrow_pda, sig,now);
        Ok(BroadcastResponse{
            signature:sig.to_string(),
            msg:"投票成功".into()
        })
    }
}
