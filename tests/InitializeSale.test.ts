import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import * as helpers from "../tests/helpers";
import { expect } from "chai";
import BN from "bn.js";
import { Keypair } from "@solana/web3.js";

describe("initialize_sale tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const payer = Keypair.generate();
  let mint: anchor.web3.PublicKey;

  before(async () => {
    await helpers.airdropSol(provider, payer.publicKey);
    ({ mint } = await helpers.createMintAndMintToOwner(
      provider,
      payer.publicKey
    ));
  });

  it("start time is in the past", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);

      const startSaleTime = new BN(now - 10);
      const endSaleTime = new BN(now + 1000);
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
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
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid start sale time" });
    }
  });

  it("end time is before start time", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.sub(new BN(1));
      const cliff = startSaleTime.add(new BN(1000));
      const vestingEndTime = startSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
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
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid end sale time" });
    }
  });

  it("end time is equal to start time", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime;
      const cliff = startSaleTime.add(new BN(1000));
      const vestingEndTime = startSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
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
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid end sale time" });
    }
  });

  it("cliff is before start time", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = startSaleTime.sub(new BN(1));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
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
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid cliff" });
    }
  });

  it("cliff is less than or equal to end time", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime;
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
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
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid cliff" });
    }
  });

  it("price is equal to 0", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          new BN(0),
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc,
          helpers.availableAllocationsPerParticipant
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid price" });
    }
  });

  it("allocation is equal to 0", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          helpers.priceLamports,
          new BN(0),
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc,
          helpers.availableAllocationsPerParticipant
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid allocation" });
    }
  });

  it("available tokens after cliff ptc is equal to 0", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          helpers.priceLamports,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          0,
          helpers.availableAllocationsPerParticipant
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid available tokens after cliff ptc" });
    }
  });

  it("soft cap is equal to 0", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          helpers.priceLamports,
          helpers.allocation,
          new BN(0),
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc,
          helpers.availableAllocationsPerParticipant
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid soft cap" });
    }
  });

  it("hard cap is equal to 0", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          helpers.priceLamports,
          helpers.allocation,
          helpers.softCap,
          new BN(0),
          helpers.availableTokensAfterCliffPtc,
          helpers.availableAllocationsPerParticipant
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid hard cap" });
    }
  });

  it("hard cap is less than or equal to soft cap", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          helpers.priceLamports,
          helpers.allocation,
          helpers.softCap,
          helpers.softCap,
          helpers.availableTokensAfterCliffPtc,
          helpers.availableAllocationsPerParticipant
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid hard cap" });
    }
  });

  it("available allocations per participant is equal to 0", async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const startSaleTime = new BN(now + 100);
      const endSaleTime = startSaleTime.add(new BN(1000));
      const cliff = endSaleTime.add(new BN(100));
      const vestingEndTime = endSaleTime.add(new BN(2000));
      await program.methods
        .initializeSale(
          startSaleTime,
          endSaleTime,
          cliff,
          vestingEndTime,
          helpers.priceLamports,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc,
          new BN(0)
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid available allocations per participant" });
    }
  });

  it("initialize_sale successfully", async () => {
    const newPayer = Keypair.generate();
    await helpers.airdropSol(provider, newPayer.publicKey, 10);
    const { mint: newMint } = await helpers.createMintAndMintToOwner(
      provider,
      newPayer.publicKey
    );
    const now = Math.floor(Date.now() / 1000);
    const startSaleTime = new BN(now + 100);
    const endSaleTime = startSaleTime.add(new BN(1000));
    const cliff = endSaleTime.add(new BN(100));
    const vestingEndTime = endSaleTime.add(new BN(2000));
    const sig = await program.methods.initializeSale(
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
        owner: newPayer.publicKey,
        tokenMint: newMint,
    }).signers([newPayer]).rpc();
    
    const latest = await provider.connection.getLatestBlockhash("confirmed");
    await provider.connection.confirmTransaction(
      { signature: sig, ...latest },
      "confirmed"
    );

    await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    console.log("Transaction signature:", sig);
  });
});