import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import BN from "bn.js";
import { expect } from "chai";

export const startTime = new BN(Math.floor(Date.now() / 1000) + 10);
export const cliff = startTime.add(new BN(1));
export const endTime = startTime.add(new BN(3));
export const price = 0.0001;
export const totalSupply = new BN(1000);
export const availableToBuy = new BN(200);
export const availableTokensAfterCliffPtc = 20;

export const airdropSol = async (
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
  sol: number = 2
) => {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );

  const latest = await provider.connection.getLatestBlockhash("confirmed");
  await provider.connection.confirmTransaction(
    { signature: sig, ...latest },
    "confirmed"
  );
};

export const createMintAndMintToOwner = async (provider: anchor.AnchorProvider, 
    owner: PublicKey, 
    amount: number = 1000): Promise<{ mint: PublicKey, amount: number }> => {
    const payer = (provider.wallet as anchor.Wallet).payer;
    const mint = await createMint(
      provider.connection,
      payer,
      owner,
      owner,
      6
    );

    return { mint, amount };
}

export type ExpectedIdlError = {
  msg?: string;
  code?: string;
  number?: number;
};

export function expectIdlError(
  program: Program<any>,
  error: any,
  expected: ExpectedIdlError
) {
  const idlErrors = new Map<number, string>(
    (program.idl.errors ?? []).map((e) => [e.code, e.msg] as [number, string])
  );
  const translated = anchor.translateError(error, idlErrors);

  if (!translated) {
    console.log("raw error logs:", error?.logs);
    console.log("raw tx logs:", error?.transactionLogs);
  }

  expect(translated).to.not.eq(null);

  if (translated instanceof anchor.ProgramError) {
    if (expected.msg) expect(translated.msg).to.eq(expected.msg);
    if (expected.number !== undefined) expect(translated.code).to.eq(expected.number);
    return;
  }

  if (translated instanceof anchor.AnchorError) {
    if (expected.code) expect(translated.error.errorCode.code).to.eq(expected.code);
    if (expected.msg) expect(translated.error.errorMessage).to.eq(expected.msg);
    if (expected.number !== undefined) expect(translated.error.errorCode.number).to.eq(expected.number);
    return;
  }
  
  expect.fail("Unexpected translated error type");
}