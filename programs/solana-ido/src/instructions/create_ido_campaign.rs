use {
    crate::{instructions::IdoError, state::IdoCampaign}, 
    anchor_lang::prelude::*, anchor_spl::token::{Mint, Token, TokenAccount}
};

#[derive(Accounts)]
pub struct CreateIdoCampaign<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + std::mem::size_of::<IdoCampaign>(),
        seeds = [b"ido_campaign", owner.key().as_ref()], bump,
    )]
    pub ido_campaign: Account<'info, IdoCampaign>,

    #[account(
        mut, 
        seeds = [b"sol_treasury", ido_campaign.key().as_ref()], bump,
    )]
    pub sol_treasury: SystemAccount<'info>,

    #[account(
        init, 
        payer = owner,
        token::mint = token_mint,
        token::authority = ido_campaign,
        seeds = [b"tokens_treasury", ido_campaign.key().as_ref()], bump)]
    pub tokens_treasury: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_sale(ctx: Context<CreateIdoCampaign>, 
    start_sale_time: u64, 
    end_sale_time: u64, 
    cliff: u64, 
    vesting_end_time: u64,
    price: f64, 
    allocation: u64,
    soft_cap: u64,
    hard_cap: u64,
    available_tokens_after_cliff_ptc: i32,
    available_allocations_per_participant: u64,
) -> Result<()> {
    check_time(start_sale_time, end_sale_time, cliff, vesting_end_time)?;
    check_economic_parameters(price, allocation, available_allocations_per_participant, soft_cap, hard_cap, available_tokens_after_cliff_ptc)?;

    ctx.accounts.ido_campaign.authority = ctx.accounts.owner.key();
    ctx.accounts.ido_campaign.token_treasury = ctx.accounts.tokens_treasury.key();
    ctx.accounts.ido_campaign.sol_treasury = ctx.accounts.sol_treasury.key();
    ctx.accounts.ido_campaign.cliff = cliff;
    ctx.accounts.ido_campaign.available_tokens_after_cliff_ptc = available_tokens_after_cliff_ptc;
    ctx.accounts.ido_campaign.start_sale_time = start_sale_time;
    ctx.accounts.ido_campaign.end_sale_time = end_sale_time;
    ctx.accounts.ido_campaign.vesting_end_time = vesting_end_time;
    ctx.accounts.ido_campaign.price = price;
    ctx.accounts.ido_campaign.total_sold = 0;
    ctx.accounts.ido_campaign.total_participants = 0;
    ctx.accounts.ido_campaign.total_claimed = 0;
    ctx.accounts.ido_campaign.allocation = allocation;
    ctx.accounts.ido_campaign.soft_cap = soft_cap;
    ctx.accounts.ido_campaign.hard_cap = hard_cap;
    ctx.accounts.ido_campaign.token_mint = ctx.accounts.token_mint.key();
    ctx.accounts.ido_campaign.available_allocations_per_participant = available_allocations_per_participant;

    return Ok(());
}

fn check_time(start_sale_time: u64, end_sale_time: u64, cliff: u64, vesting_end_time: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require!(start_sale_time > now, IdoError::ErrInvalidStartSaleTime);
    require!(end_sale_time > start_sale_time, IdoError::ErrInvalidEndSaleTime);
    require!(end_sale_time != start_sale_time, IdoError::ErrInvalidEndSaleTime);
    require!(cliff > start_sale_time && cliff > end_sale_time, IdoError::ErrInvalidCliff);
    require!(vesting_end_time > end_sale_time, IdoError::ErrInvalidVestingEndTime);

    return Ok(());
}

fn check_economic_parameters(
    price: f64,  
    allocation: u64,
    available_allocations_per_participant: u64,
    soft_cap: u64,
    hard_cap: u64,
    available_tokens_after_cliff_ptc: i32,
) -> Result<()> {
    require!(price > 0.0, IdoError::ErrInvalidPrice);
    require!(allocation > 0, IdoError::ErrInvalidAllocation);
    require!(available_allocations_per_participant > 0, IdoError::ErrInvalidAvailableAllocationsPerParticipant);
    require!(available_tokens_after_cliff_ptc > 0, IdoError::ErrInvalidAvailableTokensAfterCliffPtc);
    require!(soft_cap > 0, IdoError::ErrInvalidSoftCap);
    require!(hard_cap > 0, IdoError::ErrInvalidHardCap);
    require!(hard_cap > soft_cap, IdoError::ErrInvalidHardCap);

    return Ok(());
}