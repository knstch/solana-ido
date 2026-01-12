use {
    crate::{instructions::IdoError, state::IdoCampaign},
    anchor_lang::prelude::*,
    anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked},
};

#[derive(Accounts)]
pub struct DepositTokensToSale<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"ido_campaign"], bump,
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
    
    require!(
        ctx.accounts.ido_campaign.token_mint != owner_token_account.mint,
        IdoError::InvalidOwnerTokenAccount
    );
    require!(
        ctx.accounts.token_mint.key() == owner_token_account.mint,
        IdoError::InvalidMintAccount
    );
    require!(
        owner_token_account.amount >= ctx.accounts.ido_campaign.total_supply,
        IdoError::InvalidBalanceOfTokensToDeposit
    );

    let cpi_accounts = TransferChecked {
        from: owner_token_account.to_account_info(),
        to: ctx.accounts.tokens_treasury.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    token::transfer_checked(cpi_ctx, owner_token_account.amount, ctx.accounts.token_mint.decimals)?;

    return Ok(());
}