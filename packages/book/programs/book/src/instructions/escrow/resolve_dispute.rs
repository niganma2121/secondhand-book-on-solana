use crate::event::DisputeResolvedEvent;
use crate::{nft_to_buyer, nft_to_seller, ArbitrationResult, BookStatus, Escrow, VoteChoice};
use crate::{ADMIN_SIGNER, ARBITRATORS,Book, AppError, EscrowState, BOOK_SEED, ESCROW_SEED};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[derive(Accounts)]
#[instruction(choice:VoteChoice,refund_amount:u64)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        constraint=ARBITRATORS.contains(&arbitrator.key()) @ AppError::UnauthorizedArbitrator
    )]
    pub arbitrator: Signer<'info>, //仲裁员
    #[account(
        constraint=admin_signer.key()==ADMIN_SIGNER @ AppError::AdminUnmatch
    )]
    pub admin_signer:Signer<'info>,//后端签名,承担NFT转移相关payer
    #[account(
        mut,
        constraint=escrow.state==EscrowState::Disputed @ AppError::InvalidEscrowState,
        constraint=choice!=VoteChoice::NotVoted @ AppError::InvalidVoteChoice,
        constraint=refund_amount<=escrow.price @AppError::InvalidRefund,
        seeds=[ESCROW_SEED,escrow.buyer.as_ref(),escrow.book.as_ref()],
        bump=escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds=[BOOK_SEED,escrow.asset.as_ref()],
        bump=book.bump
    )]
    pub book: Account<'info, Book>,

    #[account(
        mut,
        constraint=buyer.key()==escrow.buyer @ AppError::BuyerUnmatched
    )]
    pub buyer: SystemAccount<'info>,

    #[account(
        mut,
        constraint=seller.key()==escrow.seller @ AppError::SellerUnmatched
    )]
    pub seller: SystemAccount<'info>,
    #[account(
        mut,
        constraint=asset.key()==book.asset @AppError::InvalidAsset,
    )]

    ///CHECK:NFT地址
    pub asset:UncheckedAccount<'info>,
    #[account(mut)]
    ///CHECK:关联的系列
    pub collection:UncheckedAccount<'info>,
    #[account(address=mpl_core::ID)]
    ///CHECK:MPL Core
    pub mpl_core_program:UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn resolve_dispute(
    ctx: Context<ResolveDispute>,
    choice: VoteChoice,
    refund_amount: u64,
    return_book: bool,
) -> Result<()> {
    let price = ctx.accounts.escrow.price;
    let bump = ctx.accounts.escrow.bump;
    let buyer_key = ctx.accounts.escrow.buyer;
    let book_key = ctx.accounts.escrow.book;

    let escrow = &mut ctx.accounts.escrow;

    let dispute = escrow
        .dispute
        .as_mut()
        .ok_or(AppError::InvalidEscrowState)?;

    //验证仲裁员的身份
    let vote_index = dispute
        .votes
        .iter()
        .position(|v| v.arbitrator == ctx.accounts.arbitrator.key())
        .ok_or(AppError::UnauthorizedArbitrator)?;

    //防止重复投票
    require!(
        dispute.votes[vote_index].vote == VoteChoice::NotVoted,
        AppError::AlreadyVoted
    );

    //投票
    dispute.votes[vote_index].vote = choice;

    //统计票数
    let buyer_votes = dispute
        .votes
        .iter()
        .filter(|v| v.vote == VoteChoice::Buyer)
        .count();
    let seller_votes = dispute
        .votes
        .iter()
        .filter(|v| v.vote == VoteChoice::Seller)
        .count();

    //判断是否达到2/3,没有就等待其他人投票
    if buyer_votes < 2 && seller_votes < 2 {
        return Ok(());
    }

    //仲裁完成,执行裁决
    let seeds: &[&[u8]] = &[ESCROW_SEED, buyer_key.as_ref(), book_key.as_ref(), &[bump]];
    let escrow_signer_seeds = &[seeds];
    let book_seeds: &[&[u8]] = &[
        BOOK_SEED,
        ctx.accounts.book.asset.as_ref(),
        &[ctx.accounts.book.bump],
    ];
    let book_signer_seeds = &[book_seeds];

    //买家胜出
    if buyer_votes >= 2 {
        dispute.arb_res = ArbitrationResult::BuyerWin;
        dispute.refund_amount = refund_amount;
        dispute.return_book = return_book;
        escrow.state = EscrowState::Released;

        //退部分金额/全额退款
        if refund_amount > 0 {
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow.to_account_info(),
                        to: ctx.accounts.buyer.to_account_info(),
                    },
                    escrow_signer_seeds,
                ),
                refund_amount,
            )?;
        }

        //剩余打款给卖家
        let seller_amount = price - refund_amount;
        if seller_amount > 0 {
            transfer_seller(&ctx, escrow_signer_seeds, seller_amount)?;
        }

        let mpl_core_program=ctx.accounts.mpl_core_program.to_account_info();
        if return_book {
            //退货给卖家
            //上面已完成解冻,
            nft_to_seller(
                &mpl_core_program,
                &ctx.accounts.asset.to_account_info(),
                &ctx.accounts.collection.to_account_info(),
                &ctx.accounts.admin_signer.to_account_info(),
                &ctx.accounts.book.to_account_info(),
                &ctx.accounts.system_program.to_account_info(),
                book_signer_seeds
            )?;
            ctx.accounts.book.owner = ctx.accounts.seller.key();
            ctx.accounts.book.seller = ctx.accounts.seller.key();
            ctx.accounts.book.status = BookStatus::Listed;
        } else {
            //书给买家
            //已经解冻,直接操作
            nft_to_buyer(
                &ctx.accounts.mpl_core_program.to_account_info(),
                &ctx.accounts.asset.to_account_info(),
                &ctx.accounts.collection.to_account_info(),
                &ctx.accounts.admin_signer.to_account_info(),
                &ctx.accounts.book.to_account_info(),
                &ctx.accounts.buyer.to_account_info(),
                &ctx.accounts.system_program.to_account_info(),
                book_signer_seeds
            )?;
            ctx.accounts.book.owner = ctx.accounts.buyer.key();
            ctx.accounts.book.seller = ctx.accounts.buyer.key();
            ctx.accounts.book.status = BookStatus::Sold;
        }
    } else {
        //买家胜出,正常流程
        dispute.arb_res = ArbitrationResult::SellerWin;
        dispute.return_book = false;
        dispute.refund_amount = 0;
        escrow.state = EscrowState::Released;
        //正常打款给卖家
        transfer_seller(&ctx, escrow_signer_seeds, price)?;
        nft_to_buyer(
            &ctx.accounts.mpl_core_program.to_account_info(),
            &ctx.accounts.asset.to_account_info(),
            &ctx.accounts.collection.to_account_info(),
            &ctx.accounts.admin_signer.to_account_info(),
            &ctx.accounts.book.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            book_signer_seeds
        )?;
        ctx.accounts.book.owner = ctx.accounts.buyer.key();
        ctx.accounts.book.seller = ctx.accounts.buyer.key();
        ctx.accounts.book.status=BookStatus::Sold;
    }

    let arb_res=if buyer_votes >= 2 {
        ArbitrationResult::BuyerWin
    } else {
        ArbitrationResult::SellerWin
    };
    emit!(DisputeResolvedEvent {
        escrow: ctx.accounts.escrow.key(),
        result: arb_res,
        refund_amount,
        return_book,
    });
    Ok(())
}

pub fn transfer_seller(
    ctx: &Context<ResolveDispute>,
    signer_seeds: &[&[&[u8]]],
    price: u64,
) -> Result<()> {
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.seller.to_account_info(),
            },
            signer_seeds,
        ),
        price,
    )?;
    Ok(())
}
