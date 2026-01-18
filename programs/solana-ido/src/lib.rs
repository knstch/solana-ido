#![allow(deprecated)]

use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use {
    instructions::*,
};

declare_id!("DLThX59oXgmtrkGJbyjTjkwC4qBp4H36QfGJvfFCsiue");

#[program]
pub mod solana_ido {
    use super::*;

    pub fn initialize_sale(ctx: Context<CreateIdoCampaign>,     
        start_time: u64, 
        end_time: u64, 
        cliff: u64, 
        vesting_end_time: u64,
        price_lamports: u64,
        allocation: u64,
        soft_cap: u64,
        hard_cap: u64,
        available_tokens_after_cliff_ptc: i32,
        available_allocations_per_participant: u64,
    ) -> Result<()> {
        crate::instructions::create_ido_campaign::initialize_sale(
            ctx,
            start_time, 
            end_time, 
            cliff, 
            vesting_end_time,
            price_lamports,
            allocation, 
            soft_cap,
            hard_cap,
            available_tokens_after_cliff_ptc,
            available_allocations_per_participant,
        )
    }
    pub fn deposit_tokens_to_sale(ctx: Context<DepositTokensToSale>) -> Result<()> {
        crate::instructions::deposit_tokens_to_sale::deposit_tokens_to_sale(ctx)
    }

    pub fn join_ido(ctx: Context<JoinIdo>, number_of_allocations: u64) -> Result<()> {
        crate::instructions::join_ido::join_ido(ctx, number_of_allocations)
    }
    
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        crate::instructions::claim::claim(ctx)
    }

    pub fn withdraw_funds(ctx: Context<WithdrawFunds>) -> Result<()> {
        crate::instructions::withdraw_funds::withdraw_funds(ctx)
    }

    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        crate::instructions::close_campaign::close_campaign(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        crate::instructions::refund::refund(ctx)
    }

    pub fn close_campaign_if_soft_cap_not_reached(
        ctx: Context<CloseCampaignIfSoftCapNotReached>,
    ) -> Result<()> {
        crate::instructions::close_campaign_if_soft_cap_not_reached::close_campaign_if_soft_cap_not_reached(ctx)
    }

    pub fn withdraw_tokens_to_owner_if_soft_cap_not_reached(
        ctx: Context<WithdrawTokensToOwnerIfSoftCapNotReached>,
    ) -> Result<()> {
        crate::instructions::withdraw_tokens_to_owner_if_soft_cap_not_reached::withdraw_tokens_to_owner_if_soft_cap_not_reached(ctx)
    }
}
