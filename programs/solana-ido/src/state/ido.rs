use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct IdoCampaign {
    pub authority: Pubkey,
    pub token_treasury: Pubkey,
    pub sol_treasury: Pubkey,
    pub cliff: u64,
    pub available_tokens_after_cliff_ptc: i32,
    pub start_time: u64,
    pub end_time: u64,
    pub price: f64,
    pub total_supply: u64,
    pub total_claimed: u64,
    pub available_to_buy: u64,
    pub token_mint: Pubkey,
}