use anchor_lang::prelude::*;

#[error_code]
pub enum IdoError {
    #[msg("Unauthorized")]
    ErrUnauthorized,
    #[msg("Invalid proof")]
    ErrInvalidProof,
    #[msg("Invalid start time")]
    ErrInvalidStartTime,
    #[msg("Invalid end time")]
    ErrInvalidEndTime,
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
}