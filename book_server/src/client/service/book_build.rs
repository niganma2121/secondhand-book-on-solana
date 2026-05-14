use super::*;

/// Book交易构建
impl AnchorService {
    /// 初始化一个全新的 MPL Core collection（平台默认 collection）。
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
        let book_pda = self.book_pda(&asset_pubkey);
        let program = self.get_program()?;
        let admin_pk = self.admin_keypair.pubkey();
        // MPL Core：Create 时不可同时指定 collection 与 update_authority（0x1d）。
        // 资产以独立 asset 创建并由 Book PDA 任 update authority；平台 collection 仅用于业务/库表字段，不链上挂 collection。
        let mint_ix = CreateV1Builder::new()
            .asset(asset_pubkey)
            .collection(None)
            .authority(Some(admin_pk))
            .payer(seller)
            .owner(Some(seller))
            // 由 Book PDA 持有 Core 的 update authority，转卖时程序可 CPI 更新 `uri` 与元数据一致。
            .update_authority(Some(book_pda))
            .name(req.name.clone())
            .uri(metadata_url)
            .instruction();
        let create_ix = program
            .request()
            .accounts(accounts::CreateBook {
                seller,
                book: book_pda,
                asset: asset_pubkey,
                collection,
                mpl_core_program: MPL_CORE,
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

    /// 转卖：仅组装 relist 交易，不新建 asset/book。
    pub async fn build_relist_book_tx_only(
        &self,
        req: RelistBookBuildTxRequest,
    ) -> Result<CreateBookTxResponse, ClientError> {
        let seller = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        if req.metadata_hash.len() != 32 {
            return Err(ClientError::TxBuildError(
                "metadata_hash 长度须为 32 字节".into(),
            ));
        }
        let mut hash_arr = [0u8; 32];
        hash_arr.copy_from_slice(&req.metadata_hash);
        let book_pda = self.book_pda(&asset);
        let program = self.get_program()?;
        let collection = self.book_collection;

        let ix = program
            .request()
            .accounts(accounts::RelistBook {
                owner: seller,
                book: book_pda,
                asset,
                collection,
                mpl_core_program: MPL_CORE,
                system_program: SYSTEM_PROGRAM_ID,
            })
            .args(args::RelistBook {
                new_price: req.price,
                metadata_id: req.metadata_cid.clone(),
                metadata_hash: hash_arr,
                metadata_url: req.metadata_url.clone(),
            })
            .instructions()?;
        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&seller), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(CreateBookTxResponse {
            tx: serialize_tx(&tx)?,
            asset: req.asset,
            book_pda: book_pda.to_string(),
            msg: "转卖交易构造成功，签名后可重新上架".into(),
            cover_url: req.cover_url,
            detail_urls: req.detail_urls,
            metadata_url: req.metadata_url,
            metadata_hash: req.metadata_hash,
        })
    }

    /// 一步式上架：上传 → metadata → 组交易 与分步接口共享逻辑。
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
            .upload_create_book_image(req.cover_image, req.cover_filename, req.cover_mime_type)
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
        let owner = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let _collection = parse(&req.collection)?;
        let book_pda = self.book_pda(&asset);
        let program = self.get_program()?;

        let delist_ix = program
            .request()
            .accounts(accounts::DelistBook {
                owner,
                book: book_pda,
            })
            .args(args::DelistBook {})
            .instructions()?;
        let burn_ix = BurnV1Builder::new()
            .asset(asset)
            .collection(None)
            .payer(owner)
            .instruction();
        let mut all_ix = delist_ix;
        all_ix.push(burn_ix);

        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(all_ix.as_ref(), Some(&owner), &block_hash);
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
        let owner = parse(&req.seller)?;
        let asset = parse(&req.asset)?;
        let book_pda = self.book_pda(&asset);
        let program = self.get_program()?;

        let ix = program
            .request()
            .accounts(accounts::UpdateBookPrice {
                owner,
                book: book_pda,
            })
            .args(args::UpdateBookPrice {
                new_price: req.new_price,
            })
            .instructions()?;
        let block_hash = self.get_blockhash().await?;
        let msg = Message::new_with_blockhash(ix.as_ref(), Some(&owner), &block_hash);
        let tx = Transaction::new_unsigned(msg);

        Ok(UnsignedTxResponse {
            tx: serialize_tx(&tx)?,
            msg: "".to_string(),
        })
    }
}