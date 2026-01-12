use anchor_lang::prelude::*;

declare_id!("HWNuWbtV6cxzgJTwsBBccrgArmdYdi75h6Gw6BGwr4y7");

#[program]
pub mod solana_ido {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
