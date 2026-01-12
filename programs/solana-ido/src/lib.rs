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
        price: f64, 
        total_supply: u64, 
        available_to_buy: u64,
        available_tokens_after_cliff_ptc: i32) -> Result<()> {
        crate::instructions::create_ido_campaign::initialize_sale(
            ctx,
            start_time, 
            end_time, 
            cliff, 
            price, 
            total_supply, 
            available_to_buy, 
            available_tokens_after_cliff_ptc)
    }
    pub fn deposit_tokens_to_sale(ctx: Context<DepositTokensToSale>) -> Result<()> {
        crate::instructions::deposit_tokens_to_sale::deposit_tokens_to_sale(ctx)
    }
}
