import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import BN from "bn.js";
import { expect } from "chai";

export const startTime = new BN(Math.floor(Date.now() / 1000) + 1);
export const cliff = startTime.add(new BN(4));
export const endTime = startTime.add(new BN(3));
export const vestingEndTime = endTime.add(new BN(2000));
export const price = 0.0001;
export const allocation = new BN(100);
export const softCap = new BN(500);
export const hardCap = new BN(1000);
export const availableTokensAfterCliffPtc = 20;
export const availableAllocationsPerParticipant = new BN(5);

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
    owner: PublicKey): Promise<{ mint: PublicKey }> => {
    const payer = (provider.wallet as anchor.Wallet).payer;
    const mint = await createMint(
      provider.connection,
      payer,
      owner,
      owner,
      6
    );

    return { mint };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitUntil = async (unixTs: number) => {
  const now = Math.floor(Date.now() / 1000);
  const delta = unixTs - now;
  if (delta <= 0) return;
  await sleep((delta + 1) * 1000);
};

export function expectedUnlockedTotal(params: {
  total: number;
  pctAfterCliff: number;
  cliff: number;
  vestingEnd: number;
  now: number;
}) {
  const { total, pctAfterCliff, cliff, vestingEnd, now } = params;
  if (now < cliff) return 0;
  const cliffUnlocked = Math.floor((total * pctAfterCliff) / 100);
  if (now >= vestingEnd) return total;
  if (now === cliff) return cliffUnlocked;
  const remaining = total - cliffUnlocked;
  const elapsed = now - cliff;
  const duration = vestingEnd - cliff;
  const linear = Math.floor((remaining * elapsed) / duration);
  return Math.min(total, cliffUnlocked + linear);
}

export async function getTokenBalanceOrZero(
  provider: anchor.AnchorProvider,
  tokenAccount: PublicKey
): Promise<BN> {
  try {
    const acc = await getAccount(provider.connection, tokenAccount);
    return new BN(acc.amount.toString());
  } catch {
    return new BN(0);
  }
}

export async function setupCampaign(params: {
  program: any;
  provider: anchor.AnchorProvider;
  owner: anchor.web3.Keypair;
  mint: PublicKey;
  startSaleTime: BN;
  endSaleTime: BN;
  cliff: BN;
  vestingEndTime: BN;
  price: number;
  allocation: BN;
  softCap: BN;
  hardCap: BN;
  availableTokensAfterCliffPtc: number;
  availableAllocationsPerParticipant: BN;
}) {
  const {
    program,
    provider,
    owner,
    mint,
    startSaleTime,
    endSaleTime,
    cliff,
    vestingEndTime,
    price,
    allocation,
    softCap,
    hardCap,
    availableTokensAfterCliffPtc,
    availableAllocationsPerParticipant,
  } = params;

  await airdropSol(provider, owner.publicKey, 10);

  const [idoCampaignPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ido_campaign"), owner.publicKey.toBuffer()],
    program.programId
  );
  const [tokensTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tokens_treasury"), idoCampaignPda.toBuffer()],
    program.programId
  );

  const p: any = program;
  await p.methods
    .initializeSale(
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      price,
      allocation,
      softCap,
      hardCap,
      availableTokensAfterCliffPtc,
      availableAllocationsPerParticipant
    )
    .accounts({
      owner: owner.publicKey,
      tokenMint: mint,
    })
    .signers([owner])
    .rpc();

  const ownerAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    owner,
    mint,
    owner.publicKey
  ).then((ata) => ata.address);

  // Mint plenty; deposit will transfer exactly `hardCap` base units.
  await mintTo(
    provider.connection,
    owner,
    mint,
    ownerAta,
    owner,
    hardCap.toNumber() * 10 ** 6
  );

  await p.methods
    .depositTokensToSale()
    .accounts({
      owner: owner.publicKey,
      tokenMint: mint,
      ownerTokenAccount: ownerAta,
    })
    .signers([owner])
    .rpc();

  return {
    idoCampaignPda,
    tokensTreasuryPda,
    ownerAta,
  };
}

export async function joinAsParticipant(params: {
  program: any;
  provider: anchor.AnchorProvider;
  owner: anchor.web3.Keypair;
  participant: anchor.web3.Keypair;
  idoCampaignPda: PublicKey;
  startSaleTime: BN;
  endSaleTime: BN;
  allocations: BN;
}) {
  const {
    program,
    provider,
    owner,
    participant,
    idoCampaignPda,
    allocations,
    startSaleTime,
    endSaleTime,
  } = params;

  const p: any = program;
  await airdropSol(provider, participant.publicKey, 10);
  await waitUntil(startSaleTime.toNumber());
  expect(Math.floor(Date.now() / 1000)).to.be.lessThan(endSaleTime.toNumber());

  await p.methods
    .joinIdo(allocations)
    .accounts({
      participant: participant.publicKey,
      idoCampaignOwner: owner.publicKey,
    })
    .signers([participant])
    .rpc();

  const [userPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), idoCampaignPda.toBuffer(), participant.publicKey.toBuffer()],
    program.programId
  );

  return { userPda };
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

  if (error?.name === "AssertionError") {
    throw error;
  }

  const idlErrors = new Map<number, string>(
    (program.idl.errors ?? []).map((e) => [e.code, e.msg] as [number, string])
  );
  const translated = anchor.translateError(error, idlErrors) ?? error;

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

  const message: string =
    translated?.message ??
    error?.message ??
    error?.toString?.() ??
    "";

  const logsAny: any = error?.logs ?? error?.transactionLogs ?? translated?.logs ?? translated?.transactionLogs;
  const logsText = Array.isArray(logsAny) ? logsAny.join("\n") : "";

  if (expected.number !== undefined) {
    const haystack = `${logsText}\n${message}`;
    const m = haystack.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (m?.[1]) {
      const parsed = parseInt(m[1], 16);
      expect(parsed).to.eq(expected.number);
      return;
    }
  }

  if (expected.msg) {
    if (logsText) {
      expect(logsText).to.contain(expected.msg);
      return;
    }

    expect(message).to.contain(expected.msg);
    return;
  }

  expect.fail(`Unexpected translated error type: ${translated?.constructor?.name ?? typeof translated}`);
}