use anchor_lang::prelude::*;

#[error_code]
pub enum IdoError {
    #[msg("Unauthorized")]
    ErrUnauthorized,
    #[msg("Invalid proof")]
    ErrInvalidProof,
    #[msg("Invalid start sale time")]
    ErrInvalidStartSaleTime,
    #[msg("Invalid end sale time")]
    ErrInvalidEndSaleTime,
    #[msg("Invalid cliff")]
    ErrInvalidCliff,
    #[msg("Invalid price")]
    ErrInvalidPrice,
    #[msg("Invalid balance of tokens to deposit")]
    ErrInvalidBalanceOfTokensToDeposit,
    #[msg("Invalid allocation")]
    ErrInvalidAllocation,
    #[msg("Math overflow")]
    ErrMathOverflow,
    #[msg("Nothing to claim")]
    ErrNothingToClaim,
    #[msg("Invalid mint account")]
    ErrInvalidMintAccount,
    #[msg("Invalid owner token account")]
    ErrInvalidOwnerTokenAccount,
    #[msg("Invalid available tokens after cliff ptc")]
    ErrInvalidAvailableTokensAfterCliffPtc,
    #[msg("Invalid tokens treasury mint")]
    ErrInvalidTokensTreasuryMint,
    #[msg("Invalid owner")]
    ErrInvalidOwner,
    #[msg("Invalid soft cap")]
    ErrInvalidSoftCap,
    #[msg("Invalid hard cap")]
    ErrInvalidHardCap,
    #[msg("Invalid available allocations per participant")]
    ErrInvalidAvailableAllocationsPerParticipant,
    #[msg("Invalid number of allocations")]
    ErrInvalidNumberOfAllocations,
    #[msg("Now is not in sale period")]
    ErrInvalidSalePeriod,
    #[msg("This allocation is not available")]
    ErrThisAllocationIsNotAvailable,
    #[msg("User already joined")]
    ErrUserAlreadyJoined,
    #[msg("Insufficient funds")]
    ErrInsufficientFunds,
    #[msg("Token supply not deposited")]
    ErrTokenSupplyNotDeposited,
    #[msg("Invalid vesting end time")]
    ErrInvalidVestingEndTime,
    #[msg("User not joined")]
    ErrUserNotJoined,
    #[msg("Invalid ido campaign")]
    ErrInvalidIdoCampaign,
    #[msg("Invalid tokens treasury amount")]
    ErrInvalidTokensTreasuryAmount,
    #[msg("Insufficient funds in treasury")]
    ErrInsufficientFundsInTreasury,
    #[msg("Funds already withdrawn")]
    ErrFundsAlreadyWithdrawn,
    #[msg("Soft cap not reached")]
    ErrSoftCapNotReached,
    #[msg("Invalid token mint")]
    ErrInvalidTokenMint,
    #[msg("Sale already closed")]
    ErrSaleAlreadyClosed,
    #[msg("Sale is ended")]
    ErrSaleEnded,
    #[msg("Total claimed not zero")]
    ErrTotalClaimedNotZero,
    #[msg("Nothing to refund")]
    ErrNothingToRefund,
    #[msg("Sale not closed")]
    ErrSaleNotClosed,
    #[msg("Not enough funds in sol treasury")]
    ErrNotEnoughFundsInSolTreasury,
    #[msg("Invalid sol treasury")]
    ErrInvalidSolTreasury,
}