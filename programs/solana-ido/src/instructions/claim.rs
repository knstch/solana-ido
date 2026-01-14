use {
    crate::{instructions::IdoError, state::{IdoCampaign, User}}, 
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        token::{self, Mint, Token, TokenAccount, TransferChecked},
    },
};

#[derive(Accounts)]
pub struct Claim<'info> {
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
        seeds = [b"tokens_treasury", ido_campaign.key().as_ref()],
        bump,
        constraint = tokens_treasury.mint == token_mint.key() @ IdoError::ErrInvalidTokensTreasuryMint,
    )]
    pub tokens_treasury: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = participant,
        associated_token::mint = token_mint,
        associated_token::authority = participant,
    )]
    pub participant_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"user", ido_campaign.key().as_ref(), participant.key().as_ref()], bump,
    )]
    pub user: Account<'info, User>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let user = &mut ctx.accounts.user;
    let ido_campaign = &mut ctx.accounts.ido_campaign;

    require!(ctx.accounts.token_mint.key() == ido_campaign.token_mint, IdoError::ErrInvalidTokensTreasuryMint);
    require!(ido_campaign.token_supply_deposited, IdoError::ErrTokenSupplyNotDeposited);
    require!(ctx.accounts.tokens_treasury.amount > 0, IdoError::ErrInvalidTokensTreasuryAmount);
    check_user(user, ctx.accounts.participant.key(), ido_campaign.key())?;

    let amount_to_claim = calculate_amount_to_claim(user, ido_campaign)?;
    require!(amount_to_claim > 0, IdoError::ErrNothingToClaim);
    require!(ctx.accounts.tokens_treasury.amount >= amount_to_claim, IdoError::ErrInsufficientFundsInTreasury);

    user.claimed = user.claimed.checked_add(amount_to_claim).ok_or(IdoError::ErrMathOverflow)?;
    ido_campaign.total_claimed = ido_campaign.total_claimed.checked_add(amount_to_claim).ok_or(IdoError::ErrMathOverflow)?;

    transfer_tokens_to_participant(&ctx, amount_to_claim)?;

    Ok(())
}

fn transfer_tokens_to_participant(ctx: &Context<Claim>, amount_to_claim: u64) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.tokens_treasury.to_account_info(),
        to: ctx.accounts.participant_token_account.to_account_info(),
        authority: ctx.accounts.ido_campaign.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();

    let ido_campaign_owner_key = ctx.accounts.ido_campaign_owner.key();
    let ido_campaign_bump = ctx.bumps.ido_campaign;
    let ido_campaign_bump_bytes = [ido_campaign_bump];
    let signer_seeds: [&[u8]; 3] = [
        b"ido_campaign",
        ido_campaign_owner_key.as_ref(),
        &ido_campaign_bump_bytes,
    ];
    let signer = [&signer_seeds[..]];

    let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer);
    token::transfer_checked(cpi_context, amount_to_claim, ctx.accounts.token_mint.decimals)?;
    
    Ok(())
}

fn calculate_amount_to_claim(user: &User, ido_campaign: &IdoCampaign) -> Result<u64> {
    let now = Clock::get()?.unix_timestamp as u64;

    let total: u64 = user.amount;
    let claimed: u64 = user.claimed;

    if now < ido_campaign.cliff {
        return Ok(0);
    }

    require!(
        ido_campaign.vesting_end_time > ido_campaign.cliff,
        IdoError::ErrInvalidVestingEndTime
    );

    let pct_i32 = ido_campaign.available_tokens_after_cliff_ptc;
    require!(
        pct_i32 >= 0 && pct_i32 <= 100,
        IdoError::ErrInvalidAvailableTokensAfterCliffPtc
    );
    let pct: u128 = pct_i32 as u128;

    let total_u128 = total as u128;
    let claimed_u128 = claimed as u128;

    let cliff_unlocked: u128 = total_u128
        .checked_mul(pct)
        .ok_or(IdoError::ErrMathOverflow)?
        / 100u128;

    let unlocked_total: u128 = if now >= ido_campaign.vesting_end_time {
        total_u128
    } else if now == ido_campaign.cliff {
        cliff_unlocked
    } else {
        // Linear unlock of the remaining part between [cliff, vesting_end_time].
        let remaining: u128 = total_u128
            .checked_sub(cliff_unlocked)
            .ok_or(IdoError::ErrMathOverflow)?;

        let elapsed: u128 = (now - ido_campaign.cliff) as u128;
        let duration: u128 = (ido_campaign.vesting_end_time - ido_campaign.cliff) as u128;

        let linear: u128 = remaining
            .checked_mul(elapsed)
            .ok_or(IdoError::ErrMathOverflow)?
            / duration;

        let sum = cliff_unlocked
            .checked_add(linear)
            .ok_or(IdoError::ErrMathOverflow)?;

        // Safety clamp.
        sum.min(total_u128)
    };

    if unlocked_total <= claimed_u128 {
        return Ok(0);
    }

    let claimable = unlocked_total
        .checked_sub(claimed_u128)
        .ok_or(IdoError::ErrMathOverflow)?;

    Ok(claimable as u64)
}

fn check_user(user: &User, participant_key: Pubkey, ido_campaign_key: Pubkey) -> Result<()> {
    require!(
        user.joined_at > 0,
        IdoError::ErrUserNotJoined
    );
    require!(
        user.participant == participant_key,
        IdoError::ErrInvalidOwner
    );
    require!(
        user.ido_campaign == ido_campaign_key,
        IdoError::ErrInvalidIdoCampaign
    );
    require!(
        user.claimed < user.amount,
        IdoError::ErrNothingToClaim
    );

    return Ok(());
}