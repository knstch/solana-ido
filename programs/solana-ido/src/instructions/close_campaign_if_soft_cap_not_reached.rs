use {
    crate::{instructions::IdoError, state::IdoCampaign},
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct CloseCampaignIfSoftCapNotReached<'info> {
    #[account(mut)]
    pub checker: Signer<'info>,

    /// CHECK: This account is used only as a seed to derive the ido_campaign PDA
    pub ido_campaign_owner: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"ido_campaign", ido_campaign_owner.key().as_ref()], bump,
        constraint = ido_campaign.authority == ido_campaign_owner.key() @ IdoError::ErrUnauthorized,
    )]
    pub ido_campaign: Account<'info, IdoCampaign>,
}

pub fn close_campaign_if_soft_cap_not_reached(ctx: Context<CloseCampaignIfSoftCapNotReached>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let ido_campaign = &mut ctx.accounts.ido_campaign;

    require!(!ido_campaign.sale_closed, IdoError::ErrSaleAlreadyClosed);
    require!(now >= ido_campaign.end_sale_time, IdoError::ErrInvalidEndSaleTime);
    require!(ido_campaign.total_sold < ido_campaign.soft_cap, IdoError::ErrSoftCapReached);

    ido_campaign.sale_closed = true;

    return Ok(());
}