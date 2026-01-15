import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import * as helpers from "../tests/helpers";
import { expect } from "chai";
import BN from "bn.js";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

const LAUNCHPAD_OWNER = new PublicKey("BRhY2VPGiDvEnQphYjgvbCXRkGTLBY4bXzeYjDuKYkv6");

async function getConfirmedTxWithRetry(
  connection: anchor.web3.Connection,
  signature: string,
  opts?: { retries?: number; sleepMs?: number }
) {
  const retries = opts?.retries ?? 25;
  const sleepMs = opts?.sleepMs ?? 200;

  for (let i = 0; i < retries; i++) {
    const tx = await connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    await helpers.sleep(sleepMs);
  }
  return null;
}

describe("withdraw_funds tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  before(async () => {
    await helpers.airdropSol(provider, LAUNCHPAD_OWNER, 0.01);
  });

  it("fails if token supply not deposited", async () => {
    const owner = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, owner.publicKey, 10);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 4);
    const cliff = new BN(now + 10);
    const vestingEndTime = new BN(now + 20);

    await program.methods
      .initializeSale(
        startSaleTime,
        endSaleTime,
        cliff,
        vestingEndTime,
        helpers.price,
        helpers.allocation,
        helpers.softCap,
        helpers.hardCap,
        helpers.availableTokensAfterCliffPtc,
        new BN(20)
      )
      .accounts({ owner: owner.publicKey, tokenMint: mint })
      .signers([owner])
      .rpc();

    const [idoCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ido_campaign"), owner.publicKey.toBuffer()],
      program.programId
    );
    const [tokensTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tokens_treasury"), idoCampaignPda.toBuffer()],
      program.programId
    );
    const [solTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_treasury"), idoCampaignPda.toBuffer()],
      program.programId
    );

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    ).then((a) => a.address);

    await helpers.waitUntil(endSaleTime.toNumber() + 1);

    try {
      await program.methods
        .withdrawFunds()
        .accountsStrict({
          launchpadOwner: LAUNCHPAD_OWNER,
          owner: owner.publicKey,
          ownerTokenAccount: ownerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          solTreasury: solTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected withdrawFunds to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Token supply not deposited" });
    }
  });

  it("fails before end_sale_time", async () => {
    const owner = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 20);
    const cliff = new BN(now + 30);
    const vestingEndTime = new BN(now + 40);

    const { idoCampaignPda, tokensTreasuryPda, solTreasuryPda } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      price: helpers.price,
      allocation: helpers.allocation,
      softCap: helpers.softCap,
      hardCap: helpers.hardCap,
      availableTokensAfterCliffPtc: helpers.availableTokensAfterCliffPtc,
      availableAllocationsPerParticipant: new BN(20),
    });

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    ).then((a) => a.address);

    try {
      await program.methods
        .withdrawFunds()
        .accountsStrict({
          launchpadOwner: LAUNCHPAD_OWNER,
          owner: owner.publicKey,
          ownerTokenAccount: ownerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          solTreasury: solTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected withdrawFunds to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Invalid end sale time" });
    }
  });

  it("fails if soft cap not reached", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 12);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 30);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);

    const { idoCampaignPda, tokensTreasuryPda, solTreasuryPda } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      price: helpers.price,
      allocation,
      softCap,
      hardCap,
      availableTokensAfterCliffPtc: 20,
      availableAllocationsPerParticipant: new BN(20),
    });

    await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(4), // total_sold = 400 < soft_cap
    });

    await helpers.waitUntil(endSaleTime.toNumber() + 1);

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    ).then((a) => a.address);

    try {
      await program.methods
        .withdrawFunds()
        .accountsStrict({
          launchpadOwner: LAUNCHPAD_OWNER,
          owner: owner.publicKey,
          ownerTokenAccount: ownerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          solTreasury: solTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected withdrawFunds to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Soft cap not reached" });
    }
  });

  it("fails if owner token account mint is wrong", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    const { mint: wrongMint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 12);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 30);

    const { idoCampaignPda, tokensTreasuryPda, solTreasuryPda } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      price: helpers.price,
      allocation: helpers.allocation,
      softCap: helpers.softCap,
      hardCap: helpers.hardCap,
      availableTokensAfterCliffPtc: helpers.availableTokensAfterCliffPtc,
      availableAllocationsPerParticipant: new BN(20),
    });

    await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(6), // >= soft cap
    });

    await helpers.waitUntil(endSaleTime.toNumber() + 1);

    const wrongOwnerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      wrongMint,
      owner.publicKey
    ).then((a) => a.address);

    try {
      await program.methods
        .withdrawFunds()
        .accountsStrict({
          launchpadOwner: LAUNCHPAD_OWNER,
          owner: owner.publicKey,
          ownerTokenAccount: wrongOwnerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          solTreasury: solTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected withdrawFunds to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Invalid owner token account" });
    }
  });

  it("successful withdraw returns SOL and unsold tokens, sets funds_withdrawn, blocks re-withdraw", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 12);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 30);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);

    const { idoCampaignPda, tokensTreasuryPda, solTreasuryPda, ownerAta } =
      await helpers.setupCampaign({
        program,
        provider,
        owner,
        mint,
        startSaleTime,
        endSaleTime,
        cliff,
        vestingEndTime,
        price: 0.0001,
        allocation,
        softCap,
        hardCap,
        availableTokensAfterCliffPtc: 20,
        availableAllocationsPerParticipant: new BN(20),
      });

    await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(6), // total_sold = 600 => unsold = 400
    });

    await helpers.waitUntil(endSaleTime.toNumber() + 1);

    const solBefore = await provider.connection.getBalance(solTreasuryPda);
    expect(solBefore).to.be.greaterThan(0);

    const ownerSolBefore = await provider.connection.getBalance(owner.publicKey);
    const launchpadSolBefore = await provider.connection.getBalance(LAUNCHPAD_OWNER);
    const ownerAtaBefore = await getAccount(provider.connection, ownerAta);
    const treasuryBefore = await getAccount(provider.connection, tokensTreasuryPda);

    const sig = await program.methods
      .withdrawFunds()
      .accountsStrict({
        launchpadOwner: LAUNCHPAD_OWNER,
        owner: owner.publicKey,
        ownerTokenAccount: ownerAta,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        solTreasury: solTreasuryPda,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const tx = await getConfirmedTxWithRetry(provider.connection, sig, { retries: 60, sleepMs: 250 });

    const idoCampaign = await program.account.idoCampaign.fetch(idoCampaignPda);
    expect(idoCampaign.fundsWithdrawn).to.equal(true);

    const solAfter = await provider.connection.getBalance(solTreasuryPda);
    expect(solAfter).to.equal(0);

    const ownerSolAfter = await provider.connection.getBalance(owner.publicKey);
    const launchpadSolAfter = await provider.connection.getBalance(LAUNCHPAD_OWNER);

    const launchpadCut = Math.floor(solBefore / 100) * 5; // matches program: amount / 100 * 5
    const ownerCut = solBefore - launchpadCut;
    if (tx?.meta?.fee != null) {
      expect(ownerSolAfter).to.equal(ownerSolBefore + ownerCut - tx.meta.fee);
      expect(launchpadSolAfter).to.equal(launchpadSolBefore + launchpadCut);
    } else {
      expect(ownerSolAfter).to.be.at.least(ownerSolBefore + ownerCut - 100_000);
      expect(launchpadSolAfter).to.be.at.least(launchpadSolBefore + launchpadCut);
    }

    const ownerAtaAfter = await getAccount(provider.connection, ownerAta);
    const treasuryAfter = await getAccount(provider.connection, tokensTreasuryPda);

    // Treasury started with hardCap, withdraw should return unsold = hardCap - total_sold.
    expect(treasuryBefore.amount.toString()).to.equal(hardCap.toString());
    expect(treasuryAfter.amount.toString()).to.equal(new BN(600).toString());

    // Owner ATA should receive unsold tokens.
    const received = BigInt(ownerAtaAfter.amount.toString()) - BigInt(ownerAtaBefore.amount.toString());
    expect(received.toString()).to.equal("400");

    // Re-withdraw must fail.
    try {
      await program.methods
        .withdrawFunds()
        .accountsStrict({
          launchpadOwner: LAUNCHPAD_OWNER,
          owner: owner.publicKey,
          ownerTokenAccount: ownerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          solTreasury: solTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected withdrawFunds to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Funds already withdrawn" });
    }
  });
});

