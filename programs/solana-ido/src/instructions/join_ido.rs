use {
    crate::{instructions::IdoError, state::{IdoCampaign, User}}, 
    anchor_lang::{prelude::*, system_program::{self, Transfer}},
};

#[derive(Accounts)]
pub struct JoinIdo<'info> {
    #[account(mut)]
    pub participant: Signer<'info>,

    #[account()]
    pub ido_campaign_owner: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"ido_campaign", ido_campaign_owner.key().as_ref()], bump,
    )]
    pub ido_campaign: Account<'info, IdoCampaign>,

    #[account(
        mut, 
        seeds = [b"sol_treasury", ido_campaign.key().as_ref()], bump,
    )]
    pub sol_treasury: SystemAccount<'info>,

    #[account(
        init,
        payer = participant,
        space = 8 + std::mem::size_of::<User>(),
        seeds = [b"user", ido_campaign.key().as_ref(), participant.key().as_ref()], bump,
    )]
    pub user: Account<'info, User>,

    pub system_program: Program<'info, System>,
}

pub fn join_ido(ctx: Context<JoinIdo>, number_of_allocations: u64) -> Result<()> {
    let ido_campaign = &ctx.accounts.ido_campaign;
    let participant = &ctx.accounts.participant;

    let amount_to_buy = number_of_allocations
        .checked_mul(ido_campaign.allocation)
        .ok_or(IdoError::ErrMathOverflow)?;
    let total_cost_sol = ido_campaign.price * amount_to_buy as f64;
    let total_cost_lamports = (total_cost_sol * 1_000_000_000.0) as u64;

    check_campaign(ido_campaign, participant, number_of_allocations, total_cost_lamports, amount_to_buy)?;

    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.participant.to_account_info(),
            to: ctx.accounts.sol_treasury.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, total_cost_lamports)?;

    let now = Clock::get()?.unix_timestamp as u64;

    ctx.accounts.user.joined_at = now;
    ctx.accounts.user.ido_campaign = ido_campaign.key();
    ctx.accounts.user.participant = participant.key();
    ctx.accounts.user.amount = amount_to_buy;
    ctx.accounts.user.claimed = 0;

    ctx.accounts.ido_campaign.total_sold = ctx.accounts.ido_campaign.total_sold
        .checked_add(amount_to_buy)
        .ok_or(IdoError::ErrMathOverflow)?;
    ctx.accounts.ido_campaign.total_participants += 1;
    
    Ok(())
}

fn check_campaign(ido_campaign: &IdoCampaign, participant: &AccountInfo, number_of_allocations: u64, total_cost_lamports: u64, amount_to_buy: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require!(
        number_of_allocations > 0 && number_of_allocations <= ido_campaign.available_allocations_per_participant, 
        IdoError::ErrInvalidNumberOfAllocations,
    );
    
    require!(
        now >= ido_campaign.start_time && now <= ido_campaign.end_time, 
        IdoError::ErrInvalidSalePeriod,
    );
    
    let new_total_sold = ido_campaign.total_sold
        .checked_add(amount_to_buy)
        .ok_or(IdoError::ErrMathOverflow)?;
    require!(
        new_total_sold <= ido_campaign.hard_cap,
        IdoError::ErrThisAllocationIsNotAvailable,
    );

    let participant_lamports = participant.lamports();
    let user_rent = Rent::get()?.minimum_balance(std::mem::size_of::<User>() + 8);
    
    let required_lamports = total_cost_lamports
        .checked_add(user_rent)
        .ok_or(IdoError::ErrMathOverflow)?;
    require!(
        participant_lamports >= required_lamports,
        IdoError::ErrInsufficientFunds,
    );

    Ok(())
}