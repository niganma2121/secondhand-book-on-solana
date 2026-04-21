use anchor_lang::prelude::*;

#[error_code]
pub enum AppError {
    //Book部分
    #[msg("价格必须>0")]
    InvalidPrice,

    #[msg("只有本书卖家才能操作")]
    UnauthorizedSeller,

    #[msg("书籍状态不允许此操作")]
    InvalidStatus,

    #[msg("元数据哈希验证失败,数据可能已被篡改")]
    MetadataHashMismatch,

    //EsCrow部分
    #[msg("书籍的元信息匹配")]
    InvalidAsset,

    #[msg("买家地址不匹配")]
    BuyerUnmatched,

    #[msg("卖家地址不匹配")]
    SellerUnmatched,

    #[msg("传入的书和托管的书不匹配")]
    BookUnmatched,

    #[msg("非交易双方不能进行此交易操作")]
    UnauthorizedBuyerOrSeller,

    #[msg("托管订单和上传的买家不匹配")]
    UnmatchedBuyer,

    #[msg("托管状态不满足,不能进行此操作")]
    InvalidEscrowState,

    #[msg("无效的投票选项,请选择有效的选项")]
    InvalidVoteChoice,

    #[msg("提交的返回金额不能大于商品的价格")]
    InvalidRefund,

    #[msg("未授权的仲裁员")]
    UnauthorizedArbitrator,

    #[msg("不能重复投票")]
    AlreadyVoted,
    
    #[msg("管理员不匹配")]
    AdminUnmatch
}
