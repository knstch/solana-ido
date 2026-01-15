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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

describe("close_campaign tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  function derive(idoCampaignOwner: PublicKey) {
    const [idoCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ido_campaign"), idoCampaignOwner.toBuffer()],
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
    return { idoCampaignPda, tokensTreasuryPda, solTreasuryPda };
  }

  it("fails if token supply not deposited", async () => {
    const owner = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, owner.publicKey, 5);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 30);
    const cliff = new BN(now + 40);
    const vestingEndTime = new BN(now + 60);

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

    const { idoCampaignPda, tokensTreasuryPda } = derive(owner.publicKey);
    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    ).then((a) => a.address);

    try {
      await program.methods
        .closeCampaign()
        .accountsStrict({
          owner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          ownerTokenAccount: ownerAta,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected closeCampaign to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Token supply not deposited" });
    }
  });

  it("fails after end_sale_time", async () => {
    const owner = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, owner.publicKey, 5);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 4);
    const cliff = new BN(now + 10);
    const vestingEndTime = new BN(now + 20);

    const { idoCampaignPda, tokensTreasuryPda, ownerAta } = await helpers.setupCampaign({
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

    await helpers.waitUntil(endSaleTime.toNumber() + 1);

    try {
      await program.methods
        .closeCampaign()
        .accountsStrict({
          owner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          ownerTokenAccount: ownerAta,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected closeCampaign to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Sale is ended" });
    }
  });

  it("successful close returns ALL tokens to owner; SOL stays in sol_treasury; join/claim/deposit are blocked", async () => {
    const owner = Keypair.generate();
    const participant = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);
    await helpers.airdropSol(provider, owner.publicKey, 5);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 20);
    const cliff = new BN(now + 30);
    const vestingEndTime = new BN(now + 60);

    const { idoCampaignPda, tokensTreasuryPda, solTreasuryPda, ownerAta } = await helpers.setupCampaign({
      program,
      provider,
      owner,
      mint,
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      price: 0.0001,
      allocation: new BN(100),
      softCap: new BN(100),
      hardCap: new BN(1000),
      availableTokensAfterCliffPtc: 20,
      availableAllocationsPerParticipant: new BN(20),
    });

    const ownerAtaBefore = await getAccount(provider.connection, ownerAta);
    const treasuryBefore = await getAccount(provider.connection, tokensTreasuryPda);
    expect(treasuryBefore.amount.toString()).to.not.equal("0");

    // Put some SOL into sol_treasury by joining once.
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
    const solBefore = await provider.connection.getBalance(solTreasuryPda);
    expect(solBefore).to.be.greaterThan(0);

    await program.methods
      .closeCampaign()
      .accountsStrict({
        owner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        ownerTokenAccount: ownerAta,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    const idoCampaign = await program.account.idoCampaign.fetch(idoCampaignPda);
    expect(idoCampaign.saleClosed).to.equal(true);
    expect(idoCampaign.fundsWithdrawn).to.equal(true);

    const treasuryAfter = await getAccount(provider.connection, tokensTreasuryPda);
    expect(treasuryAfter.amount.toString()).to.equal("0");

    const ownerAtaAfter = await getAccount(provider.connection, ownerAta);
    const ownerDelta = ownerAtaAfter.amount - ownerAtaBefore.amount;
    expect(ownerDelta.toString()).to.equal(treasuryBefore.amount.toString());

    const solAfter = await provider.connection.getBalance(solTreasuryPda);
    expect(solAfter).to.equal(solBefore);

    // join_ido must be blocked
    const another = Keypair.generate();
    await helpers.airdropSol(provider, another.publicKey, 1);
    try {
      await program.methods
        .joinIdo(new BN(1))
        .accountsStrict({
          participant: another.publicKey,
          idoCampaignOwner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          solTreasury: solTreasuryPda,
          user: PublicKey.findProgramAddressSync(
            [Buffer.from("user"), idoCampaignPda.toBuffer(), another.publicKey.toBuffer()],
            program.programId
          )[0],
          systemProgram: SystemProgram.programId,
        })
        .signers([another])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Sale already closed" });
    }

    // claim must be blocked immediately by sale_closed check
    const participantAta = getAssociatedTokenAddressSync(mint, participant.publicKey, false);
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
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Sale already closed" });
    }

    // deposit must be blocked
    try {
      await program.methods
        .depositTokensToSale()
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
      expect.fail("Expected depositTokensToSale to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Sale already closed" });
    }
  });

  it("cannot close twice", async () => {
    const owner = Keypair.generate();
    const { mint } = await helpers.createMintAndMintToOwner(provider, owner.publicKey);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 30);
    const cliff = new BN(now + 40);
    const vestingEndTime = new BN(now + 60);

    const { idoCampaignPda, tokensTreasuryPda, ownerAta } = await helpers.setupCampaign({
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

    await program.methods
      .closeCampaign()
      .accountsStrict({
        owner: owner.publicKey,
        idoCampaign: idoCampaignPda,
        ownerTokenAccount: ownerAta,
        tokensTreasury: tokensTreasuryPda,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    try {
      await program.methods
        .closeCampaign()
        .accountsStrict({
          owner: owner.publicKey,
          idoCampaign: idoCampaignPda,
          ownerTokenAccount: ownerAta,
          tokensTreasury: tokensTreasuryPda,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected closeCampaign to throw");
    } catch (e: any) {
      helpers.expectIdlError(program, e, { msg: "Sale already closed" });
    }
  });
});

