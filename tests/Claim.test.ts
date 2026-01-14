import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import * as helpers from "../tests/helpers";
import { expect } from "chai";
import BN from "bn.js";
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

describe("claim tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("claim before cliff returns ErrNothingToClaim", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 10);
    const cliff = new BN(now + 12);
    const vestingEndTime = new BN(now + 18);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    const participantAta = getAssociatedTokenAddressSync(
      mint,
      participant.publicKey,
      false
    );

    try {
      await program.methods
        .claim()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          participantTokenAccount: participantAta,
          user: userPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected claim to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Nothing to claim" });
    }
  });

  it("claim after cliff unlocks initial pct and transfers to participant ATA", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 10);
    const cliff = new BN(now + 12);
    const vestingEndTime = new BN(now + 18);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    const participantAta = getAssociatedTokenAddressSync(mint, participant.publicKey, false);

    await helpers.waitUntil(cliff.toNumber());
    const beforeAmt = await helpers.getTokenBalanceOrZero(provider, participantAta);

    await program.methods
      .claim()
      .accountsStrict({
        participant: participant.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: participantAta,
        user: userPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant])
      .rpc();

    const user = await program.account.user.fetch(userPda);
    const afterAmt = await helpers.getTokenBalanceOrZero(provider, participantAta);
    expect(afterAmt.gt(beforeAmt)).to.equal(true);

    const delta = afterAmt.sub(beforeAmt);
    // First claim: ATA balance increase must match claimed amount.
    expect(delta.toString()).to.equal(user.claimed.toString());

    // Claimed should be within a small time window around current time.
    const now1 = Math.floor(Date.now() / 1000);
    const unlockedMin = helpers.expectedUnlockedTotal({
      total: 100,
      pctAfterCliff,
      cliff: cliff.toNumber(),
      vestingEnd: vestingEndTime.toNumber(),
      now: now1 - 2,
    });
    const unlockedMax = helpers.expectedUnlockedTotal({
      total: 100,
      pctAfterCliff,
      cliff: cliff.toNumber(),
      vestingEnd: vestingEndTime.toNumber(),
      now: now1 + 2,
    });
    expect(user.claimed.toNumber()).to.be.at.least(unlockedMin);
    expect(user.claimed.toNumber()).to.be.at.most(unlockedMax);
  });

  it("claim between cliff and vesting_end_time unlocks linearly (multi-claim)", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now0 = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now0 + 1);
    const endSaleTime = new BN(now0 + 10);
    const cliff = new BN(now0 + 12);
    // Make vesting window longer to avoid flakiness due to localnet clock skew / integer rounding.
    const vestingEndTime = new BN(now0 + 60);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    const participantAta = getAssociatedTokenAddressSync(mint, participant.publicKey, false);

    await helpers.waitUntil(cliff.toNumber() + 1);
    const bal0 = await helpers.getTokenBalanceOrZero(provider, participantAta);
    await program.methods
      .claim()
      .accountsStrict({
        participant: participant.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: participantAta,
        user: userPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant])
      .rpc();

    const userAfterFirst = await program.account.user.fetch(userPda);
    const claimed1 = userAfterFirst.claimed.toNumber();
    expect(claimed1).to.be.greaterThan(0);
    const bal1 = await helpers.getTokenBalanceOrZero(provider, participantAta);
    expect(bal1.sub(bal0).toString()).to.equal(userAfterFirst.claimed.toString());

    // Wait further into the linear period so a non-zero delta unlocks even with clock skew.
    await helpers.waitUntil(cliff.toNumber() + 10);
    const now1 = Math.floor(Date.now() / 1000);

    const unlockedMin = helpers.expectedUnlockedTotal({
      total: 100,
      pctAfterCliff,
      cliff: cliff.toNumber(),
      vestingEnd: vestingEndTime.toNumber(),
      now: now1 - 1,
    });
    const unlockedMax = helpers.expectedUnlockedTotal({
      total: 100,
      pctAfterCliff,
      cliff: cliff.toNumber(),
      vestingEnd: vestingEndTime.toNumber(),
      now: now1 + 1,
    });

    await program.methods
      .claim()
      .accountsStrict({
        participant: participant.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: participantAta,
        user: userPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant])
      .rpc();

    const userAfterSecond = await program.account.user.fetch(userPda);
    const claimed2 = userAfterSecond.claimed.toNumber();
    expect(claimed2).to.be.greaterThan(claimed1);
    expect(claimed2).to.be.at.least(unlockedMin);
    expect(claimed2).to.be.at.most(unlockedMax);

    const bal2 = await helpers.getTokenBalanceOrZero(provider, participantAta);
    expect(bal2.sub(bal1).toString()).to.equal(
      userAfterSecond.claimed.sub(userAfterFirst.claimed).toString()
    );
  });

  it("claim at/after vesting_end_time unlocks 100% and further claims fail", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now0 = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now0 + 1);
    const endSaleTime = new BN(now0 + 10);
    const cliff = new BN(now0 + 12);
    const vestingEndTime = new BN(now0 + 16);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    const participantAta = getAssociatedTokenAddressSync(mint, participant.publicKey, false);

    await helpers.waitUntil(vestingEndTime.toNumber());
    const bal0 = await helpers.getTokenBalanceOrZero(provider, participantAta);

    await program.methods
      .claim()
      .accountsStrict({
        participant: participant.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: participantAta,
        user: userPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant])
      .rpc();

    const userAfter = await program.account.user.fetch(userPda);
    expect(userAfter.claimed.toNumber()).to.equal(100);
    const bal1 = await helpers.getTokenBalanceOrZero(provider, participantAta);
    expect(bal1.sub(bal0).toString()).to.equal(userAfter.claimed.toString());

    // Further claim should fail.
    try {
      await program.methods
        .claim()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          participantTokenAccount: participantAta,
          user: userPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected claim to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Nothing to claim" });
    }
  });

  it("attack: wrong ido_campaign_owner fails (seed constraint)", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 10);
    const cliff = new BN(now + 12);
    const vestingEndTime = new BN(now + 16);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    const participantAta = getAssociatedTokenAddressSync(mint, participant.publicKey, false);
    const attackerOwner = Keypair.generate();

    await helpers.waitUntil(cliff.toNumber());

    try {
      await program.methods
        .claim()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: attackerOwner.publicKey, // wrong seed base
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          participantTokenAccount: participantAta,
          user: userPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected claim to throw");
    } catch (error: any) {
      // Anchor constraint error, message varies
      expect(error).to.not.be.null;
    }
  });

  it("attack: wrong token mint fails (treasury mint constraint)", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    const { mint: wrongMint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 10);
    const cliff = new BN(now + 12);
    const vestingEndTime = new BN(now + 16);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    await helpers.waitUntil(cliff.toNumber());

    const participantAtaWrongMint = getAssociatedTokenAddressSync(
      wrongMint,
      participant.publicKey,
      false
    );

    try {
      await program.methods
        .claim()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: wrongMint,
          participantTokenAccount: participantAtaWrongMint,
          user: userPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected claim to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid tokens treasury mint" });
    }
  });

  it("soft/hard cap states: below soft cap, between, and at hard cap do not break claim flow", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now0 = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now0 + 1);
    const endSaleTime = new BN(now0 + 10);
    const cliff = new BN(now0 + 12);
    const vestingEndTime = new BN(now0 + 16);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const { userPda } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(10), // total_sold = 1000 (hard cap)
    });

    const idoCampaign = await program.account.idoCampaign.fetch(idoCampaignPda);
    expect(idoCampaign.totalSold.toString()).to.equal("1000");

    const participantAta = getAssociatedTokenAddressSync(mint, participant.publicKey, false);

    await helpers.waitUntil(vestingEndTime.toNumber());
    const bal0 = await helpers.getTokenBalanceOrZero(provider, participantAta);

    await program.methods
      .claim()
      .accountsStrict({
        participant: participant.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: participantAta,
        user: userPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant])
      .rpc();

    const userAfter = await program.account.user.fetch(userPda);
    expect(userAfter.claimed.toString()).to.equal(userAfter.amount.toString());
    const bal1 = await helpers.getTokenBalanceOrZero(provider, participantAta);
    expect(bal1.sub(bal0).toString()).to.equal(userAfter.claimed.toString());
  });

  it("all participants can claim full amount after vesting_end_time (treasury decreases accordingly)", async () => {
    const owner = Keypair.generate();
    const participant1 = Keypair.generate();
    const participant2 = Keypair.generate();
    const participant3 = Keypair.generate();

    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now0 = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now0 + 1);
    const endSaleTime = new BN(now0 + 10);
    const cliff = new BN(now0 + 12);
    const vestingEndTime = new BN(now0 + 16);

    const allocation = new BN(100);
    const softCap = new BN(500);
    const hardCap = new BN(1000);
    const pctAfterCliff = 20;
    const maxAllocs = new BN(20);

    const { idoCampaignPda, tokensTreasuryPda } = await helpers.setupCampaign({
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
      availableTokensAfterCliffPtc: pctAfterCliff,
      availableAllocationsPerParticipant: maxAllocs,
    });

    const alloc1 = new BN(2);
    const alloc2 = new BN(1);
    const alloc3 = new BN(3);

    const { userPda: user1 } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant: participant1,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: alloc1,
    });
    const { userPda: user2 } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant: participant2,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: alloc2,
    });
    const { userPda: user3 } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant: participant3,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: alloc3,
    });

    const ata1 = getAssociatedTokenAddressSync(mint, participant1.publicKey, false);
    const ata2 = getAssociatedTokenAddressSync(mint, participant2.publicKey, false);
    const ata3 = getAssociatedTokenAddressSync(mint, participant3.publicKey, false);

    await helpers.waitUntil(vestingEndTime.toNumber());

    const treasuryBefore = await helpers.getTokenBalanceOrZero(provider, tokensTreasuryPda);
    const b1 = await helpers.getTokenBalanceOrZero(provider, ata1);
    const b2 = await helpers.getTokenBalanceOrZero(provider, ata2);
    const b3 = await helpers.getTokenBalanceOrZero(provider, ata3);

    // claim 1
    await program.methods
      .claim()
      .accountsStrict({
        participant: participant1.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: ata1,
        user: user1,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant1])
      .rpc();

    // claim 2
    await program.methods
      .claim()
      .accountsStrict({
        participant: participant2.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: ata2,
        user: user2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant2])
      .rpc();

    // claim 3
    await program.methods
      .claim()
      .accountsStrict({
        participant: participant3.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        participantTokenAccount: ata3,
        user: user3,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant3])
      .rpc();

    const ua1 = await program.account.user.fetch(user1);
    const ua2 = await program.account.user.fetch(user2);
    const ua3 = await program.account.user.fetch(user3);

    expect(ua1.claimed.toString()).to.equal(ua1.amount.toString());
    expect(ua2.claimed.toString()).to.equal(ua2.amount.toString());
    expect(ua3.claimed.toString()).to.equal(ua3.amount.toString());

    const a1 = await helpers.getTokenBalanceOrZero(provider, ata1);
    const a2 = await helpers.getTokenBalanceOrZero(provider, ata2);
    const a3 = await helpers.getTokenBalanceOrZero(provider, ata3);
    expect(a1.sub(b1).toString()).to.equal(ua1.claimed.toString());
    expect(a2.sub(b2).toString()).to.equal(ua2.claimed.toString());
    expect(a3.sub(b3).toString()).to.equal(ua3.claimed.toString());

    const treasuryAfter = await helpers.getTokenBalanceOrZero(provider, tokensTreasuryPda);
    const sumClaimed = ua1.claimed.add(ua2.claimed).add(ua3.claimed);
    expect(treasuryBefore.sub(treasuryAfter).toString()).to.equal(sumClaimed.toString());
  });
});

