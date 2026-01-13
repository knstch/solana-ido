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
    pub total_claimed: u64,
    pub total_sold: u64,
    pub total_participants: u64,
    pub allocation: u64,
    pub soft_cap: u64,
    pub hard_cap: u64,
    pub available_allocations_per_participant: u64,
    pub token_mint: Pubkey,
    pub token_supply_deposited: bool,
}