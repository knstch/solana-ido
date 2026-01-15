use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct User {
    pub ido_campaign: Pubkey,
    pub participant: Pubkey,
    pub amount: u64,
    pub paid_lamports: u64,
    pub claimed: u64,
    pub joined_at: u64,
}