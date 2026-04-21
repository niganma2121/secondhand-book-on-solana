use anchor_lang::prelude::*;
use crate::{Escrow, EscrowState, AppError, ESCROW_SEED, Dispute, ArbitrationResult, ARBITRATORS, ArbVote, VoteChoice};
use crate::event::DisputeOpenedEvent;

#[derive(Accounts)]
pub struct OpenDispute<'info>{
    #[account(
        mut,
        constraint=(
            signer.key()==escrow.buyer||signer.key()==escrow.seller
        )@ AppError::UnauthorizedBuyerOrSeller
    )]
    pub signer:Signer<'info>,//仲裁发起者

    #[account(
        mut,
        constraint=(
            signer.key()==escrow.seller||
            signer.key()==escrow.buyer
        ) @ AppError::UnauthorizedBuyerOrSeller,
        constraint=escrow.state==EscrowState::Shipped @ AppError::InvalidEscrowState,
        seeds=[ESCROW_SEED,escrow.buyer.as_ref(),escrow.book.as_ref()],
        bump=escrow.bump
    )]
    pub escrow:Account<'info,Escrow>
}

pub fn open_dispute(ctx:Context<OpenDispute>)->Result<()>{
    let escrow=&mut ctx.accounts.escrow;

    let votes:[ArbVote;3]=std::array::from_fn(|i| {
        ArbVote{
            arbitrator:ARBITRATORS[i],
            vote: VoteChoice::NotVoted,
        }
    });
    let dispute=Dispute{
        dispute_initiator: ctx.accounts.signer.key(),
        votes,
        arb_res: ArbitrationResult::Voting,
        refund_amount:0,
        return_book:false
    };
    escrow.dispute=Some(dispute);

    //更新状态
    escrow.state=EscrowState::Disputed;

    emit!(DisputeOpenedEvent{
        escrow:ctx.accounts.escrow.key(),
        initiator:ctx.accounts.signer.key(),
        buyer:ctx.accounts.escrow.buyer,
        seller:ctx.accounts.escrow.seller
    });
    Ok(())
}