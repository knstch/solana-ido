use {
    crate::{instructions::IdoError, state::{IdoCampaign, User}}, 
    anchor_lang::{prelude::*, system_program::{self, Transfer}},
};

#[derive(Accounts)]
pub struct JoinIdo<'info> {
    #[account(mut)]
    pub participant: Signer<'info>,

    /// CHECK: This account is used only as a seed to derive the ido_campaign PDA
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
        init_if_needed,
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

    require!(ido_campaign.price_lamports > 0, IdoError::ErrInvalidPrice);

    require!(
        ctx.accounts.user.joined_at == 0,
        IdoError::ErrUserAlreadyJoined
    );

    let amount_to_buy = number_of_allocations
        .checked_mul(ido_campaign.allocation)
        .ok_or(IdoError::ErrMathOverflow)?;

    let total_cost_lamports = amount_to_buy
        .checked_mul(ido_campaign.price_lamports)
        .ok_or(IdoError::ErrMathOverflow)?;

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
    ctx.accounts.user.paid_lamports = total_cost_lamports;
    ctx.accounts.user.claimed = 0;

    ctx.accounts.ido_campaign.total_sold = ctx.accounts.ido_campaign.total_sold
        .checked_add(amount_to_buy)
        .ok_or(IdoError::ErrMathOverflow)?;
    ctx.accounts.ido_campaign.total_participants += 1;
    
    Ok(())
}

fn check_campaign<'info>(
    ido_campaign: &IdoCampaign,
    participant: &Signer<'info>,
    number_of_allocations: u64,
    total_cost_lamports: u64,
    amount_to_buy: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require!(
        !ido_campaign.sale_closed,
        IdoError::ErrSaleAlreadyClosed,
    );

    require!(
        ido_campaign.token_supply_deposited,
        IdoError::ErrTokenSupplyNotDeposited,
    );
    
    require!(
        number_of_allocations > 0 && number_of_allocations <= ido_campaign.available_allocations_per_participant, 
        IdoError::ErrInvalidNumberOfAllocations,
    );
    
    require!(
        now >= ido_campaign.start_sale_time && now <= ido_campaign.end_sale_time, 
        IdoError::ErrInvalidSalePeriod,
    );
    
    let new_total_sold = ido_campaign.total_sold
        .checked_add(amount_to_buy)
        .ok_or(IdoError::ErrMathOverflow)?;
    require!(
        new_total_sold <= ido_campaign.hard_cap,
        IdoError::ErrThisAllocationIsNotAvailable,
    );

    let participant_lamports = participant.to_account_info().lamports();
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