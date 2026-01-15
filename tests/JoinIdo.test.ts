import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import * as helpers from "../tests/helpers";
import { expect } from "chai";
import { getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

describe("join_ido tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const owner = Keypair.generate();
  const participant = Keypair.generate();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let mint: anchor.web3.PublicKey;
  let ownerAta: anchor.web3.PublicKey;
  let idoCampaignPda: PublicKey;
  let solTreasuryPda: PublicKey;

  before(async () => {
    await helpers.airdropSol(provider, owner.publicKey, 10);
    await helpers.airdropSol(provider, participant.publicKey, 10);

    ({ mint } = await helpers.createMintAndMintToOwner(
      provider,
      owner.publicKey
    ));

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = startSaleTime.add(new BN(1000));
    const cliff = endSaleTime.add(new BN(100));
    const vestingEndTime = endSaleTime.add(new BN(2000));
    await program.methods.initializeSale(
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      helpers.priceLamports,
      helpers.allocation,
      helpers.softCap,
      helpers.hardCap,
      helpers.availableTokensAfterCliffPtc,
      helpers.availableAllocationsPerParticipant
    ).accounts({
      owner: owner.publicKey,
      tokenMint: mint,
    }).signers([owner]).rpc();

    ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey,
    ).then(ata => ata.address);

    await mintTo(
      provider.connection,
      owner,
      mint,
      ownerAta,
      owner,
      helpers.hardCap.toNumber()
    );

    await program.methods
      .depositTokensToSale()
      .accounts({
        owner: owner.publicKey,
        tokenMint: mint,
        ownerTokenAccount: ownerAta,
      })
      .signers([owner])
      .rpc();

    [idoCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ido_campaign"), owner.publicKey.toBuffer()],
      program.programId
    );

    [solTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_treasury"), idoCampaignPda.toBuffer()],
      program.programId
    );
  });

  it("token supply not deposited", async () => {
    const newOwner = Keypair.generate();
    await helpers.airdropSol(provider, newOwner.publicKey, 10);

    const { mint: newMint } = await helpers.createMintAndMintToOwner(
      provider,
      newOwner.publicKey
    );

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 100);
    const endSaleTime = startSaleTime.add(new BN(1000));
    const cliff = endSaleTime.add(new BN(100));
    const vestingEndTime = endSaleTime.add(new BN(2000));
    await program.methods.initializeSale(
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      helpers.priceLamports,
      helpers.allocation,
      helpers.softCap,
      helpers.hardCap,
      helpers.availableTokensAfterCliffPtc,
      helpers.availableAllocationsPerParticipant
    ).accounts({
      owner: newOwner.publicKey,
      tokenMint: newMint,
    }).signers([newOwner]).rpc();

    try {
      await program.methods
        .joinIdo(new BN(1))
        .accounts({
          participant: participant.publicKey,
          idoCampaignOwner: newOwner.publicKey,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Token supply not deposited" });
    }
  });

  it("number of allocations is 0", async () => {
    try {
      await program.methods
        .joinIdo(new BN(0))
        .accounts({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid number of allocations" });
    }
  });

  it("number of allocations exceeds available allocations per participant", async () => {
    try {
      await program.methods
        .joinIdo(helpers.availableAllocationsPerParticipant.add(new BN(1)))
        .accounts({
          participant: participant.publicKey,
          idoCampaignOwner: owner.publicKey,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid number of allocations" });
    }
  });

  it("sale period not started", async () => {
    const newOwner = Keypair.generate();
    await helpers.airdropSol(provider, newOwner.publicKey, 10);

    const { mint: newMint } = await helpers.createMintAndMintToOwner(
      provider,
      newOwner.publicKey
    );

    const futureStartTime = new BN(Math.floor(Date.now() / 1000) + 100);
    const futureEndTime = futureStartTime.add(new BN(10));

    const futureVestingEndTime = futureEndTime.add(new BN(2000));
    await program.methods.initializeSale(
      futureStartTime,
      futureEndTime,
      futureEndTime.add(new BN(1)),
      futureVestingEndTime,
      helpers.priceLamports,
      helpers.allocation,
      helpers.softCap,
      helpers.hardCap,
      helpers.availableTokensAfterCliffPtc,
      helpers.availableAllocationsPerParticipant
    ).accounts({
      owner: newOwner.publicKey,
      tokenMint: newMint,
    }).signers([newOwner]).rpc();

    const newOwnerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      newOwner,
      newMint,
      newOwner.publicKey,
    ).then(ata => ata.address);

    await mintTo(
      provider.connection,
      newOwner,
      newMint,
      newOwnerAta,
      newOwner,
      helpers.hardCap.toNumber()
    );

    await program.methods
      .depositTokensToSale()
      .accounts({
        owner: newOwner.publicKey,
        tokenMint: newMint,
        ownerTokenAccount: newOwnerAta,
      })
      .signers([newOwner])
      .rpc();

    try {
      await program.methods
        .joinIdo(new BN(1))
        .accounts({
          participant: participant.publicKey,
          idoCampaignOwner: newOwner.publicKey,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Now is not in sale period" });
    }
  });

  it("sale period ended", async () => {
    const newOwner = Keypair.generate();
    await helpers.airdropSol(provider, newOwner.publicKey, 10);

    const { mint: newMint } = await helpers.createMintAndMintToOwner(
      provider,
      newOwner.publicKey
    );

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = new BN(now + 2);

    const vestingEndTime = endSaleTime.add(new BN(2000));
    await program.methods.initializeSale(
      startSaleTime,
      endSaleTime,
      endSaleTime.add(new BN(1)),
      vestingEndTime,
      helpers.priceLamports,
      helpers.allocation,
      helpers.softCap,
      helpers.hardCap,
      helpers.availableTokensAfterCliffPtc,
      helpers.availableAllocationsPerParticipant
    ).accounts({
      owner: newOwner.publicKey,
      tokenMint: newMint,
    }).signers([newOwner]).rpc();

    const newOwnerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      newOwner,
      newMint,
      newOwner.publicKey,
    ).then(ata => ata.address);

    await mintTo(
      provider.connection,
      newOwner,
      newMint,
      newOwnerAta,
      newOwner,
      helpers.hardCap.toNumber()
    );

    await program.methods
      .depositTokensToSale()
      .accounts({
        owner: newOwner.publicKey,
        tokenMint: newMint,
        ownerTokenAccount: newOwnerAta,
      })
      .signers([newOwner])
      .rpc();

    await sleep(2500);

    try {
      await program.methods
        .joinIdo(new BN(1))
        .accounts({
          participant: participant.publicKey,
          idoCampaignOwner: newOwner.publicKey,
        })
        .signers([participant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Now is not in sale period" });
    }
  });

  it("allocation exceeds hard cap", async () => {
    const newOwner = Keypair.generate();
    const newParticipant = Keypair.generate();
    await helpers.airdropSol(provider, newOwner.publicKey, 10);
    await helpers.airdropSol(provider, newParticipant.publicKey, 10);

    const { mint: newMint } = await helpers.createMintAndMintToOwner(
      provider,
      newOwner.publicKey
    );

    const smallHardCap = new BN(600);
    const largeAllocation = new BN(200);

    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 1);
    const endSaleTime = startSaleTime.add(new BN(1000));
    const cliff = endSaleTime.add(new BN(100));
    const vestingEndTime = endSaleTime.add(new BN(2000));
    await program.methods.initializeSale(
      startSaleTime,
      endSaleTime,
      cliff,
      vestingEndTime,
      helpers.priceLamports,
      largeAllocation,
      helpers.softCap,
      smallHardCap,
      helpers.availableTokensAfterCliffPtc,
      helpers.availableAllocationsPerParticipant
    ).accounts({
      owner: newOwner.publicKey,
      tokenMint: newMint,
    }).signers([newOwner]).rpc();

    const newOwnerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      newOwner,
      newMint,
      newOwner.publicKey,
    ).then(ata => ata.address);

    await mintTo(
      provider.connection,
      newOwner,
      newMint,
      newOwnerAta,
      newOwner,
      smallHardCap.toNumber()
    );

    await program.methods
      .depositTokensToSale()
      .accounts({
        owner: newOwner.publicKey,
        tokenMint: newMint,
        ownerTokenAccount: newOwnerAta,
      })
      .signers([newOwner])
      .rpc();

    await sleep(1500);

    try {
      await program.methods
        .joinIdo(helpers.availableAllocationsPerParticipant)
        .accounts({
          participant: newParticipant.publicKey,
          idoCampaignOwner: newOwner.publicKey,
        })
        .signers([newParticipant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "This allocation is not available" });
    }
  });

  it("insufficient funds", async () => {
    const poorParticipant = Keypair.generate();
    const userRent = await provider.connection.getMinimumBalanceForRentExemption(
      (program.account as any).user.size
    );
    const desiredLamports = userRent + 200_000;
    await helpers.airdropSol(
      provider,
      poorParticipant.publicKey,
      desiredLamports / anchor.web3.LAMPORTS_PER_SOL
    );

    const numberAllocations = new BN(1);
    const amountToBuy = helpers.allocation.mul(numberAllocations);
    const totalCostLamports = helpers.priceLamports.mul(amountToBuy).toNumber();

    try {
      await sleep(1500);
      await program.methods
        .joinIdo(numberAllocations)
        .accounts({
          participant: poorParticipant.publicKey,
          idoCampaignOwner: owner.publicKey,
        })
        .signers([poorParticipant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Insufficient funds" });
    }
  });

  it("successful join", async () => {
    const newParticipant = Keypair.generate();
    await helpers.airdropSol(provider, newParticipant.publicKey, 10);

    const numberAllocations = new BN(1);

    await sleep(1500);
    await program.methods
      .joinIdo(numberAllocations)
      .accounts({
        participant: newParticipant.publicKey,
        idoCampaignOwner: owner.publicKey,
      })
      .signers([newParticipant])
      .rpc();

    const [userPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user"),
        idoCampaignPda.toBuffer(),
        newParticipant.publicKey.toBuffer(),
      ],
      program.programId
    );

    const userAccount = await program.account.user.fetch(userPda);
    const idoCampaign = await program.account.idoCampaign.fetch(idoCampaignPda);
    const solTreasuryBalance = await provider.connection.getBalance(solTreasuryPda);

    const expectedAmount = helpers.allocation.mul(numberAllocations);
    const expectedCostLamports = helpers.priceLamports.mul(expectedAmount).toNumber();

    expect(userAccount.amount.toString()).to.equal(expectedAmount.toString());
    expect(userAccount.participant.toString()).to.equal(newParticipant.publicKey.toString());
    expect(userAccount.idoCampaign.toString()).to.equal(idoCampaignPda.toString());
    expect(userAccount.claimed.toString()).to.equal("0");
    expect(userAccount.joinedAt.toNumber()).to.be.greaterThan(0);

    expect(idoCampaign.totalSold.toString()).to.equal(expectedAmount.toString());
    expect(idoCampaign.totalParticipants.toString()).to.equal("1");

    expect(solTreasuryBalance).to.be.greaterThanOrEqual(expectedCostLamports);
  });

  it("user already joined", async () => {
    const newParticipant = Keypair.generate();
    await helpers.airdropSol(provider, newParticipant.publicKey, 10);

    const numberAllocations = new BN(1);

    await sleep(1500);
    await program.methods
      .joinIdo(numberAllocations)
      .accounts({
        participant: newParticipant.publicKey,
        idoCampaignOwner: owner.publicKey,
      })
      .signers([newParticipant])
      .rpc();

    try {
      await program.methods
        .joinIdo(numberAllocations)
        .accounts({
          participant: newParticipant.publicKey,
          idoCampaignOwner: owner.publicKey,
        })
        .signers([newParticipant])
        .rpc();
      expect.fail("Expected joinIdo to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "User already joined" });
    }
  });

  it("multiple participants join successfully", async () => {
    const participant1 = Keypair.generate();
    const participant2 = Keypair.generate();
    const participant3 = Keypair.generate();

    await helpers.airdropSol(provider, participant1.publicKey, 10);
    await helpers.airdropSol(provider, participant2.publicKey, 10);
    await helpers.airdropSol(provider, participant3.publicKey, 10);

    const allocations1 = new BN(2);
    const allocations2 = new BN(1);
    const allocations3 = new BN(1);

    await sleep(1500);
    const idoCampaignBefore = await program.account.idoCampaign.fetch(idoCampaignPda);
    await program.methods
      .joinIdo(allocations1)
      .accounts({
        participant: participant1.publicKey,
        idoCampaignOwner: owner.publicKey,
      })
      .signers([participant1])
      .rpc();

    await program.methods
      .joinIdo(allocations2)
      .accounts({
        participant: participant2.publicKey,
        idoCampaignOwner: owner.publicKey,
      })
      .signers([participant2])
      .rpc();

    await program.methods
      .joinIdo(allocations3)
      .accounts({
        participant: participant3.publicKey,
        idoCampaignOwner: owner.publicKey,
      })
      .signers([participant3])
      .rpc();

    const idoCampaign = await program.account.idoCampaign.fetch(idoCampaignPda);

    const expectedTotalSold = helpers.allocation
      .mul(allocations1)
      .add(helpers.allocation.mul(allocations2))
      .add(helpers.allocation.mul(allocations3));

    expect(idoCampaign.totalSold.toString()).to.equal(
      idoCampaignBefore.totalSold.add(expectedTotalSold).toString()
    );
    expect(idoCampaign.totalParticipants.toString()).to.equal(
      (idoCampaignBefore.totalParticipants.toNumber() + 3).toString()
    );
  });
});
