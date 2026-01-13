use anchor_lang::prelude::*;

#[error_code]
pub enum IdoError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Invalid start time")]
    InvalidStartTime,
    #[msg("Invalid end time")]
    InvalidEndTime,
    #[msg("Invalid cliff")]
    InvalidCliff,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Invalid balance of tokens to deposit")]
    InvalidBalanceOfTokensToDeposit,
    #[msg("Invalid allocation")]
    InvalidAllocation,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Invalid mint account")]
    InvalidMintAccount,
    #[msg("Invalid owner token account")]
    InvalidOwnerTokenAccount,
    #[msg("Invalid available tokens after cliff ptc")]
    InvalidAvailableTokensAfterCliffPtc,
    #[msg("Invalid tokens treasury mint")]
    InvalidTokensTreasuryMint,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid soft cap")]
    InvalidSoftCap,
    #[msg("Invalid hard cap")]
    InvalidHardCap,
}