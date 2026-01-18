import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import * as helpers from "../tests/helpers";
import { expect } from "chai";
import BN from "bn.js";
import { getAccount, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

async function getConfirmedTxWithRetry(
  connection: anchor.web3.Connection,
  signature: string,
  opts?: { retries?: number; sleepMs?: number }
) {
  const retries = opts?.retries ?? 60;
  const sleepMs = opts?.sleepMs ?? 400;

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

function derive(programId: PublicKey, idoCampaignOwner: PublicKey) {
  const [idoCampaignPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ido_campaign"), idoCampaignOwner.toBuffer()],
    programId
  );
  const [tokensTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tokens_treasury"), idoCampaignPda.toBuffer()],
    programId
  );
  const [solTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_treasury"), idoCampaignPda.toBuffer()],
    programId
  );
  return { idoCampaignPda, tokensTreasuryPda, solTreasuryPda };
}

describe("failed soft cap flow tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("permissionless close + multi-participant exact refunds + owner token withdraw", async () => {
    const owner = Keypair.generate();
    const checker = Keypair.generate();
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    const p3 = Keypair.generate();

    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, checker.publicKey, 1);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 8);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 40);

    // total_sold will be 400, soft_cap is 900 -> failed campaign
    const allocation = new BN(100);
    const softCap = new BN(900);
    const hardCap = new BN(1000);
    const priceLamports = new BN(100_000);

    const { idoCampaignPda, tokensTreasuryPda, solTreasuryPda, ownerAta } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      priceLamports,
      allocation,
      softCap,
      hardCap,
      availableTokensAfterCliffPtc: 20,
      availableAllocationsPerParticipant: new BN(20),
    });

    const { userPda: user1 } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant: p1,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });
    const { userPda: user2 } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant: p2,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(2),
    });
    const { userPda: user3 } = await helpers.joinAsParticipant({
      program,
      provider,
      owner,
      participant: p3,
      idoCampaignPda,
      startSaleTime,
      endSaleTime,
      allocations: new BN(1),
    });

    const expectedPaid1 = new BN(1).mul(allocation).mul(priceLamports); // 100 * price
    const expectedPaid2 = new BN(2).mul(allocation).mul(priceLamports); // 200 * price
    const expectedPaid3 = new BN(1).mul(allocation).mul(priceLamports); // 100 * price
    const expectedTotalPaid = expectedPaid1.add(expectedPaid2).add(expectedPaid3);

    const solTreasuryBalBeforeClose = await provider.connection.getBalance(solTreasuryPda);
    expect(new BN(solTreasuryBalBeforeClose).toString()).to.eq(expectedTotalPaid.toString());

    await helpers.waitUntil(endSaleTime.toNumber() + 1);

    await program.methods
      .closeCampaignIfSoftCapNotReached()
      .accountsStrict({
        checker: checker.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
      })
      .signers([checker])
      .rpc();

    const ido = await program.account.idoCampaign.fetch(idoCampaignPda);
    expect(ido.saleClosed).to.eq(true);

    async function refundExact(params: {
      participant: Keypair;
      userPda: PublicKey;
      expectedPaid: BN;
    }) {
      const { participant, userPda, expectedPaid } = params;
      const balBefore = await provider.connection.getBalance(participant.publicKey);
      const treasuryBefore = await provider.connection.getBalance(solTreasuryPda);

      const sig = await program.methods
        .refund()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          user: userPda,
          solTreasury: solTreasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();

      // Ensure the signature is finalized before reading balances/tx details
      const latest = await provider.connection.getLatestBlockhash("finalized");
      await provider.connection.confirmTransaction({ signature: sig, ...latest }, "finalized");

      const tx = await getConfirmedTxWithRetry(provider.connection, sig);
      if (tx) {
        expect(tx.meta?.err).to.eq(null);

        const keys = tx.transaction.message.accountKeys;
        const pre = tx.meta!.preBalances;
        const post = tx.meta!.postBalances;

        const iTreasury = keys.findIndex((k) => k.equals(solTreasuryPda));
        const iParticipant = keys.findIndex((k) => k.equals(participant.publicKey));
        expect(iTreasury).to.be.greaterThan(-1);
        expect(iParticipant).to.be.greaterThan(-1);

        const treasuryDelta = new BN(pre[iTreasury]).sub(new BN(post[iTreasury]));
        expect(treasuryDelta.toString()).to.eq(expectedPaid.toString());

        // Refund amount must be exact for the participant. (Fee payer can be the provider wallet.)
        const participantDelta = new BN(post[iParticipant]).sub(new BN(pre[iParticipant]));
        expect(participantDelta.toString()).to.eq(expectedPaid.toString());
      }

      const balAfter = await provider.connection.getBalance(participant.publicKey);
      // Exactness guarantee we care about: SOL treasury decreases by exactly what the user paid.

      const treasuryAfter = await provider.connection.getBalance(solTreasuryPda);
      expect(new BN(treasuryBefore).sub(new BN(treasuryAfter)).toString()).to.eq(expectedPaid.toString());

      const userAcc: any = await program.account.user.fetch(userPda);
      expect(new BN(userAcc.amount.toString()).toString()).to.eq("0");
      expect(new BN(userAcc.paidLamports.toString()).toString()).to.eq("0");
    }

    await refundExact({ participant: p1, userPda: user1, expectedPaid: expectedPaid1 });
    await refundExact({ participant: p2, userPda: user2, expectedPaid: expectedPaid2 });
    await refundExact({ participant: p3, userPda: user3, expectedPaid: expectedPaid3 });

    const solTreasuryAfterRefunds = await provider.connection.getBalance(solTreasuryPda);
    expect(solTreasuryAfterRefunds).to.eq(0);

    const treasuryTokenBefore = await getAccount(provider.connection, tokensTreasuryPda);
    const ownerAtaBefore = await getAccount(provider.connection, ownerAta);
    expect(treasuryTokenBefore.amount.toString()).to.not.eq("0");

    await program.methods
      .withdrawTokensToOwnerIfSoftCapNotReached()
      .accountsStrict({
        owner: owner.publicKey,
        ownerTokenAccount: ownerAta,
        idoCampaign: idoCampaignPda,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    const treasuryTokenAfter = await getAccount(provider.connection, tokensTreasuryPda);
    expect(treasuryTokenAfter.amount.toString()).to.eq("0");

    const ownerAtaAfter = await getAccount(provider.connection, ownerAta);
    const ownerDelta = ownerAtaAfter.amount - ownerAtaBefore.amount;
    expect(ownerDelta.toString()).to.eq(treasuryTokenBefore.amount.toString());

    const idoAfter = await program.account.idoCampaign.fetch(idoCampaignPda);
    expect(idoAfter.fundsWithdrawn).to.eq(true);

    // security: re-withdraw must fail
    try {
      await program.methods
        .withdrawTokensToOwnerIfSoftCapNotReached()
        .accountsStrict({
          owner: owner.publicKey,
          ownerTokenAccount: ownerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected re-withdraw to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Funds already withdrawn" });
    }
  });

  it("security: closeCampaignIfSoftCapNotReached fails before end_sale_time", async () => {
    const owner = Keypair.generate();
    const checker = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, checker.publicKey, 1);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 40);
    const cliff = new BN(now + 60);
    const vestingEndTime = new BN(now + 120);

    const { idoCampaignPda } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      priceLamports: helpers.priceLamports,
      allocation: helpers.allocation,
      softCap: helpers.softCap,
      hardCap: helpers.hardCap,
      availableTokensAfterCliffPtc: 20,
      availableAllocationsPerParticipant: new BN(20),
    });

    try {
      await program.methods
        .closeCampaignIfSoftCapNotReached()
        .accountsStrict({
          checker: checker.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
        })
        .signers([checker])
        .rpc();
      expect.fail("Expected closeCampaignIfSoftCapNotReached to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Invalid end sale time" });
    }
  });

  it("security: closeCampaignIfSoftCapNotReached fails if soft cap reached", async () => {
    const owner = Keypair.generate();
    const checker = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, checker.publicKey, 1);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 8);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 40);

    const allocation = new BN(100);
    const softCap = new BN(200);
    const hardCap = new BN(1000);

    const { idoCampaignPda } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      priceLamports: helpers.priceLamports,
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
      allocations: new BN(2), // total_sold == soft_cap
    });

    await helpers.waitUntil(endSaleTime.toNumber() + 1);
    try {
      await program.methods
        .closeCampaignIfSoftCapNotReached()
        .accountsStrict({
          checker: checker.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
        })
        .signers([checker])
        .rpc();
      expect.fail("Expected closeCampaignIfSoftCapNotReached to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Soft cap reached" });
    }
  });

  it("security: refund fails if campaign is not closed yet; double refund fails", async () => {
    const owner = Keypair.generate();
    const checker = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, checker.publicKey, 1);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 8);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 40);

    const allocation = new BN(100);
    const softCap = new BN(900);
    const hardCap = new BN(1000);

    const { idoCampaignPda, solTreasuryPda } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      priceLamports: helpers.priceLamports,
      allocation,
      softCap,
      hardCap,
      availableTokensAfterCliffPtc: 20,
      availableAllocationsPerParticipant: new BN(20),
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

    // refund before close must fail
    try {
      await program.methods
        .refund()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          user: userPda,
          solTreasury: solTreasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected refund to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Sale not closed" });
    }

    await helpers.waitUntil(endSaleTime.toNumber() + 1);
    await program.methods
      .closeCampaignIfSoftCapNotReached()
      .accountsStrict({
        checker: checker.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
      })
      .signers([checker])
      .rpc();

    await program.methods
      .refund()
      .accountsStrict({
        participant: participant.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        user: userPda,
        solTreasury: solTreasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([participant])
      .rpc();

    // double refund must fail
    try {
      await program.methods
        .refund()
        .accountsStrict({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          user: userPda,
          solTreasury: solTreasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected second refund to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Nothing to refund" });
    }
  });

  it("security: withdrawTokensToOwnerIfSoftCapNotReached fails with wrong mint", async () => {
    const owner = Keypair.generate();
    const checker = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, checker.publicKey, 1);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 8);
    const cliff = new BN(now + 20);
    const vestingEndTime = new BN(now + 40);

    const allocation = new BN(100);
    const softCap = new BN(900);
    const hardCap = new BN(1000);

    const { idoCampaignPda, tokensTreasuryPda, ownerAta } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      priceLamports: helpers.priceLamports,
      allocation,
      softCap,
      hardCap,
      availableTokensAfterCliffPtc: 20,
      availableAllocationsPerParticipant: new BN(20),
    });

    await helpers.waitUntil(endSaleTime.toNumber() + 1);
    await program.methods
      .closeCampaignIfSoftCapNotReached()
      .accountsStrict({
        checker: checker.publicKey,
        idoCampaignOwner: owner.publicKey,
        idoCampaign: idoCampaignPda,
      })
      .signers([checker])
      .rpc();

    const wrongMintOwner = Keypair.generate();
    const { mint: wrongMint } = await helpers.createMintAndMintToOwner(provider, wrongMintOwner.publicKey);

    try {
      await program.methods
        .withdrawTokensToOwnerIfSoftCapNotReached()
        .accountsStrict({
          owner: owner.publicKey,
          ownerTokenAccount: ownerAta,
          idoCampaign: idoCampaignPda,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: wrongMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected withdrawTokensToOwnerIfSoftCapNotReached to throw");
    } catch (e: any) {
      // owner_token_account.mint == token_mint constraint triggers first
      helpers.expectIdlError(program, e, { msg: "Invalid owner token account" });
    }
  });
});

