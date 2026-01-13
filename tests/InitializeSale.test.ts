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
      await program.methods
        .initializeSale(
          new BN(now - 10),
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid start time" });
    }
  });

  it("end time is before start time", async () => {
    try {
      await program.methods
        .initializeSale(
          helpers.endTime,
          helpers.startTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid end time" });
    }
  });

  it("end time is equal to start time", async () => {
    try {
      await program.methods
        .initializeSale(
          helpers.endTime,
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
        )
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected initializeSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid end time" });
    }
  });

  it("cliff is before start time", async () => {
    try {
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff.sub(new BN(1)),
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
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

  it("cliff is greater then end time", async () => {
    try {
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.endTime.add(new BN(1)),
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
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
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          0,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
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

  it("price is less then 0", async () => {
    try {
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          -1,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
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
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          new BN(0),
          helpers.softCap,
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
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
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.hardCap,
          0
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
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          new BN(0),
          helpers.hardCap,
          helpers.availableTokensAfterCliffPtc
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
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          new BN(0),
          helpers.availableTokensAfterCliffPtc
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
      await program.methods
        .initializeSale(
          helpers.startTime,
          helpers.endTime,
          helpers.cliff,
          helpers.price,
          helpers.allocation,
          helpers.softCap,
          helpers.softCap,
          helpers.availableTokensAfterCliffPtc
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

  it("initialize_sale successfully", async () => {
    const sig = await program.methods.initializeSale(
        helpers.startTime,
        helpers.endTime,
        helpers.cliff,
        helpers.price,
        helpers.allocation,
        helpers.softCap,
        helpers.hardCap,
        helpers.availableTokensAfterCliffPtc
    ).accounts({
        owner: payer.publicKey,
        tokenMint: mint,
    }).signers([payer]).rpc();
    
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