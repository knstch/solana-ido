import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaIdo } from "../target/types/solana_ido";
import * as helpers from "../tests/helpers";
import { expect } from "chai";
import { getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

describe("deposit_tokens_to_sale tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaIdo as Program<SolanaIdo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const payer = Keypair.generate();

  let mint: anchor.web3.PublicKey;
  let ownerAta: anchor.web3.PublicKey;

  before(async () => {
    await helpers.airdropSol(provider, payer.publicKey);
    ({ mint } = await helpers.createMintAndMintToOwner(
      provider,
      payer.publicKey
    ));

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
        owner: payer.publicKey,
        tokenMint: mint,
    }).signers([payer]).rpc();

    ownerAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        payer.publicKey,
      ).then(ata => ata.address);
  });

  it("wrong mint account", async () => {
    const { mint: wrongMintAccount } = await helpers.createMintAndMintToOwner(
        provider,
        payer.publicKey
      );

    try {
      await program.methods
        .depositTokensToSale()
        .accounts({
          owner: payer.publicKey,
          tokenMint: wrongMintAccount,
          ownerTokenAccount: ownerAta,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected depositTokensToSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid mint account" });
    }
  });

  it("wrong owner token account", async () => {
    const { mint: wrongMintAccount } = await helpers.createMintAndMintToOwner(
        provider,
        payer.publicKey
      );

    const wrongOwnerAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        wrongMintAccount,
        payer.publicKey,
      ).then(ata => ata.address);

    try {
      await program.methods
        .depositTokensToSale()
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
          ownerTokenAccount: wrongOwnerAta,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected depositTokensToSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid owner token account" });
    }
  });

  it("insufficient balance of tokens to deposit", async () => {
    try {
      await program.methods
        .depositTokensToSale()
        .accounts({
          owner: payer.publicKey,
          tokenMint: mint,
          ownerTokenAccount: ownerAta,
        })
        .signers([payer])
        .rpc();
      expect.fail("Expected depositTokensToSale to throw");
    } catch (error: any) {
      helpers.expectIdlError(program, error, { msg: "Invalid balance of tokens to deposit" });
    }
  });

  it("successful deposit", async () => {
    await mintTo(
      provider.connection,
      payer,
      mint,
      ownerAta,
      payer,
      helpers.hardCap.toNumber()
    );

    await program.methods
    .depositTokensToSale()
    .accounts({
      owner: payer.publicKey,
      tokenMint: mint,
      ownerTokenAccount: ownerAta,
    })
    .signers([payer])
    .rpc();

    const [idoCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ido_campaign"), payer.publicKey.toBuffer()],
      program.programId
    );
    
    const [tokensTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tokens_treasury"), idoCampaignPda.toBuffer()],
      program.programId
    );

    const tokensTreasuryAccount = await getAccount(
      provider.connection,
      tokensTreasuryPda
    );

    const idoCampaign = await program.account.idoCampaign.fetch(idoCampaignPda);

    expect(tokensTreasuryAccount.amount.toString()).to.equal((helpers.hardCap.toString()).toString());
    expect(idoCampaign.tokenSupplyDeposited).to.equal(true);
  });
});