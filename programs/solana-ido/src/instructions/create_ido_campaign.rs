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
    start_time: u64, 
    end_time: u64, 
    cliff: u64, 
    price: f64, 
    total_supply: u64, 
    available_to_buy: u64,
    available_tokens_after_cliff_ptc: i32) -> Result<()> {
    check_time(start_time, end_time, cliff)?;
    check_economic_parameters(price, total_supply, available_to_buy, available_tokens_after_cliff_ptc)?;

    ctx.accounts.ido_campaign.authority = ctx.accounts.owner.key();
    ctx.accounts.ido_campaign.token_treasury = ctx.accounts.tokens_treasury.key();
    ctx.accounts.ido_campaign.sol_treasury = ctx.accounts.sol_treasury.key();
    ctx.accounts.ido_campaign.cliff = cliff;
    ctx.accounts.ido_campaign.available_tokens_after_cliff_ptc = available_tokens_after_cliff_ptc;
    ctx.accounts.ido_campaign.start_time = start_time;
    ctx.accounts.ido_campaign.end_time = end_time;
    ctx.accounts.ido_campaign.price = price;
    ctx.accounts.ido_campaign.total_supply = total_supply;
    ctx.accounts.ido_campaign.available_to_buy = available_to_buy;
    ctx.accounts.ido_campaign.token_mint = ctx.accounts.token_mint.key();

    return Ok(());
}

fn check_time(start_time: u64, end_time: u64, cliff: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require!(start_time > now, IdoError::InvalidStartTime);
    require!(end_time > start_time, IdoError::InvalidEndTime);
    require!(end_time != start_time, IdoError::InvalidEndTime);
    require!(cliff > start_time, IdoError::InvalidCliff);
    require!(cliff < end_time, IdoError::InvalidCliff);

    return Ok(());
}

fn check_economic_parameters(price: f64, total_supply: u64, available_to_buy: u64, available_tokens_after_cliff_ptc: i32) -> Result<()> {
    require!(price > 0.0, IdoError::InvalidPrice);
    require!(total_supply > 0, IdoError::InvalidTotalSupply);
    require!(total_supply > available_to_buy, IdoError::InvalidTotalSupply);
    require!(available_to_buy > 0, IdoError::InvalidAvailableToBuy);
    require!(available_tokens_after_cliff_ptc > 0, IdoError::InvalidAvailableTokensAfterCliffPtc);

    return Ok(());
}