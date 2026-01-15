use {
    crate::{instructions::IdoError, state::{IdoCampaign, User}}, 
    anchor_lang::{prelude::*, system_program::{self, Transfer}},
};

#[derive(Accounts)]
pub struct Refund<'info> {
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
        seeds = [b"user", ido_campaign.key().as_ref(), participant.key().as_ref()], bump,
    )]
    pub user: Account<'info, User>,

    #[account(
        mut, 
        constraint = sol_treasury.key() == ido_campaign.sol_treasury @ IdoError::ErrInvalidSolTreasury,
        seeds = [b"sol_treasury", ido_campaign.key().as_ref()], bump,
    )]
    pub sol_treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn refund(ctx: Context<Refund>) -> Result<()> {
    let ido_campaign = &ctx.accounts.ido_campaign;
    let participant = &ctx.accounts.participant;
    let user = &mut ctx.accounts.user;
    let sol_treasury = &mut ctx.accounts.sol_treasury;

    require!(ido_campaign.sale_closed, IdoError::ErrSaleNotClosed);
    require!(user.amount > 0, IdoError::ErrNothingToRefund);
    require!(user.joined_at > 0, IdoError::ErrUserNotJoined);
    require!(user.participant == participant.key(), IdoError::ErrUnauthorized);
    require!(user.ido_campaign == ido_campaign.key(), IdoError::ErrInvalidIdoCampaign);

    let amount_to_refund_lamports = user.paid_lamports;

    require!(sol_treasury.lamports() >= amount_to_refund_lamports, IdoError::ErrNotEnoughFundsInSolTreasury);

    let ido_campaign_key = ido_campaign.key();
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
            from: sol_treasury.to_account_info(),
            to: participant.to_account_info(),
        },
        &signer,
    );
    system_program::transfer(cpi_context, amount_to_refund_lamports)?;    

    user.amount = 0;
    user.paid_lamports = 0;

    Ok(())
}