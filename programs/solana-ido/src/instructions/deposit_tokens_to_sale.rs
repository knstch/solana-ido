use {
    crate::{instructions::IdoError, state::IdoCampaign},
    anchor_lang::prelude::*,
    anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked},
};

#[derive(Accounts)]
pub struct DepositTokensToSale<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, constraint = owner_token_account.owner == owner.key() @ IdoError::ErrInvalidOwner)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"ido_campaign", owner.key().as_ref()], bump,
    )]
    pub ido_campaign: Account<'info, IdoCampaign>,

    #[account(
        mut,
        seeds = [b"tokens_treasury", ido_campaign.key().as_ref()], bump)]
    pub tokens_treasury: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit_tokens_to_sale(ctx: Context<DepositTokensToSale>) -> Result<()> {
    let owner_token_account = &ctx.accounts.owner_token_account;
    let ido_campaign = &ctx.accounts.ido_campaign;
    let token_mint_account = &ctx.accounts.token_mint;
    let tokens_treasury = &ctx.accounts.tokens_treasury;

    check_token_accounts(
        owner_token_account, 
        ido_campaign, 
        token_mint_account.key(), 
        tokens_treasury, 
    )?;
    
    require!(
        owner_token_account.amount >= ido_campaign.hard_cap,
        IdoError::ErrInvalidBalanceOfTokensToDeposit
    );

    let cpi_accounts = TransferChecked {
        from: owner_token_account.to_account_info(),
        to: tokens_treasury.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
        mint: token_mint_account.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    token::transfer_checked(cpi_ctx, ido_campaign.hard_cap, token_mint_account.decimals)?;

    return Ok(());
}

fn check_token_accounts(
    owner_token_account: &TokenAccount, 
    ido_campaign: &IdoCampaign, 
    token_mint_account_key: Pubkey, 
    tokens_treasury: &TokenAccount,
) -> Result<()> {
    require!(
        token_mint_account_key == ido_campaign.token_mint,
        IdoError::ErrInvalidMintAccount
    );
    require!(
        ido_campaign.token_mint == owner_token_account.mint,
        IdoError::ErrInvalidOwnerTokenAccount
    );
    require!(
        tokens_treasury.mint == token_mint_account_key,
        IdoError::ErrInvalidTokensTreasuryMint
    );

    return Ok(());
}