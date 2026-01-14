use {
    crate::{instructions::IdoError, state::IdoCampaign}, 
    anchor_lang::prelude::*,
    anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked},
};

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"ido_campaign", owner.key().as_ref()], bump,
        constraint = ido_campaign.authority == owner.key() @ IdoError::ErrUnauthorized,
    )]
    pub ido_campaign: Account<'info, IdoCampaign>,

    #[account(
        mut, 
        constraint = owner_token_account.owner == owner.key() @ IdoError::ErrInvalidOwner,
        constraint = owner_token_account.mint == token_mint.key() @ IdoError::ErrInvalidOwnerTokenAccount,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut, 
        seeds = [b"tokens_treasury", ido_campaign.key().as_ref()],
        bump,
        constraint = tokens_treasury.mint == token_mint.key() @ IdoError::ErrInvalidTokensTreasuryMint,
        constraint = tokens_treasury.key() == ido_campaign.token_treasury @ IdoError::ErrInvalidIdoCampaign,
    )]
    pub tokens_treasury: Account<'info, TokenAccount>,

    #[account(
        constraint = token_mint.key() == ido_campaign.token_mint @ IdoError::ErrInvalidTokenMint,
    )]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let ido_campaign = &mut ctx.accounts.ido_campaign;

    require!(!ido_campaign.sale_closed, IdoError::ErrSaleAlreadyClosed);
    require!(now < ido_campaign.end_sale_time as i64, IdoError::ErrSaleEnded);
    require!(!ido_campaign.funds_withdrawn, IdoError::ErrFundsAlreadyWithdrawn);
    require!(ido_campaign.total_claimed == 0, IdoError::ErrTotalClaimedNotZero);
    require!(ido_campaign.token_supply_deposited, IdoError::ErrTokenSupplyNotDeposited);

    let owner_key = ctx.accounts.owner.key();
    let bump = ctx.bumps.ido_campaign;
    let bump_bytes = [bump];
    let seeds: [&[u8]; 3] = [
        b"ido_campaign",
        owner_key.as_ref(),
        &bump_bytes,
    ];
    let signer = [&seeds[..]];

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.tokens_treasury.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ido_campaign.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        },
        &signer,
    );

    token::transfer_checked(cpi_context, ctx.accounts.tokens_treasury.amount, ctx.accounts.token_mint.decimals)?;

    ido_campaign.sale_closed = true;
    ido_campaign.funds_withdrawn = true;

    Ok(())
}