use {
    crate::{instructions::IdoError, state::IdoCampaign}, 
    anchor_lang::{prelude::*, system_program::{self, Transfer}},
    anchor_spl::{
        token::{self, Mint, Token, TokenAccount, TransferChecked},
    },
};

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(
        mut,
        address = anchor_lang::solana_program::pubkey!("BRhY2VPGiDvEnQphYjgvbCXRkGTLBY4bXzeYjDuKYkv6") @ IdoError::ErrUnauthorized,
    )]
    pub launchpad_owner: SystemAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut, constraint = owner_token_account.owner == owner.key() @ IdoError::ErrInvalidOwner)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"ido_campaign", owner.key().as_ref()], bump,
    )]
    pub ido_campaign: Account<'info, IdoCampaign>,

    #[account(
        mut, 
        seeds = [b"tokens_treasury", ido_campaign.key().as_ref()],
        bump,
        constraint = tokens_treasury.mint == token_mint.key() @ IdoError::ErrInvalidTokensTreasuryMint,
        constraint = tokens_treasury.key() == ido_campaign.token_treasury @ IdoError::ErrInvalidIdoCampaign,
    )]
    pub tokens_treasury: Account<'info, TokenAccount>,

    #[account(
        mut, 
        seeds = [b"sol_treasury", ido_campaign.key().as_ref()],
        bump,
        constraint = sol_treasury.key() == ido_campaign.sol_treasury @ IdoError::ErrInvalidIdoCampaign,
    )]
    pub sol_treasury: SystemAccount<'info>,

    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_funds(ctx: Context<WithdrawFunds>) -> Result<()> {
    check_ido_campaign(&ctx.accounts.ido_campaign, ctx.accounts.owner.key())?;

    check_withdraw_token_accounts(
        ctx.accounts.ido_campaign.token_mint,
        ctx.accounts.token_mint.key(),
        ctx.accounts.owner_token_account.mint,
    )?;

    withdraw_all_sol_to_owners(&ctx)?;

    withdraw_unsold_tokens_to_owner(&ctx)?;
    
    ctx.accounts.ido_campaign.funds_withdrawn = true;

    return Ok(());
}

fn withdraw_all_sol_to_owners(ctx: &Context<WithdrawFunds>) -> Result<()> {
    let amount = ctx.accounts.sol_treasury.lamports();
    if amount == 0 {
        return Ok(());
    }

    let amount_to_launchpad_owner = amount / 100 * 5;
    let amount_to_owner = amount - amount_to_launchpad_owner;

    let ido_campaign_key = ctx.accounts.ido_campaign.key();
    let bump = ctx.bumps.sol_treasury;
    let bump_bytes = [bump];
    let seeds: [&[u8]; 3] = [
        b"sol_treasury",
        ido_campaign_key.as_ref(),
        &bump_bytes,
    ];
    let signer = [&seeds[..]];

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.sol_treasury.to_account_info(),
            to: ctx.accounts.owner.to_account_info(),
        },
        &signer,
    );
    system_program::transfer(cpi_context, amount_to_owner)?;

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.sol_treasury.to_account_info(),
            to: ctx.accounts.launchpad_owner.to_account_info(),
        },
        &signer,
    );
    system_program::transfer(cpi_context, amount_to_launchpad_owner)?;
    
    Ok(())
}

fn withdraw_unsold_tokens_to_owner(ctx: &Context<WithdrawFunds>) -> Result<()> {
    let ido_campaign = &ctx.accounts.ido_campaign;

    let unsold_tokens = ido_campaign
        .hard_cap
        .checked_sub(ido_campaign.total_sold)
        .unwrap_or(0);
    if unsold_tokens == 0 {
        return Ok(());
    }

    require!(
        ctx.accounts.tokens_treasury.amount >= unsold_tokens,
        IdoError::ErrInsufficientFundsInTreasury
    );

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
            authority: ctx.accounts.ido_campaign.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        },
        &signer,
    );
    token::transfer_checked(cpi_context, unsold_tokens, ctx.accounts.token_mint.decimals)?;

    Ok(())
}

fn check_withdraw_token_accounts(
    ido_campaign_token_mint: Pubkey,
    token_mint_key: Pubkey,
    owner_token_account_mint: Pubkey,
) -> Result<()> {
    require!(
        ido_campaign_token_mint == token_mint_key,
        IdoError::ErrInvalidTokenMint
    );
    require!(
        owner_token_account_mint == ido_campaign_token_mint,
        IdoError::ErrInvalidOwnerTokenAccount
    );
    Ok(())
}

fn check_ido_campaign(ido_campaign: &IdoCampaign, owner: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require!(!ido_campaign.funds_withdrawn, IdoError::ErrFundsAlreadyWithdrawn);
    require!(ido_campaign.authority == owner, IdoError::ErrUnauthorized);
    require!(now >= ido_campaign.end_sale_time, IdoError::ErrInvalidEndSaleTime);
    require!(ido_campaign.token_supply_deposited, IdoError::ErrTokenSupplyNotDeposited);
    require!(ido_campaign.total_sold >= ido_campaign.soft_cap, IdoError::ErrSoftCapNotReached);

    Ok(())
}