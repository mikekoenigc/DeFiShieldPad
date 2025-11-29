import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  ConfidentialZama,
  ConfidentialUSDT,
  ShieldPadVault,
  ConfidentialZama__factory,
  ConfidentialUSDT__factory,
  ShieldPadVault__factory,
} from "../types";

describe("ShieldPadVault", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let czama: ConfidentialZama;
  let cusdt: ConfidentialUSDT;
  let vault: ShieldPadVault;
  let vaultAddress: string;
  let czamaAddress: string;
  let cusdtAddress: string;

  before(async function () {
    [deployer, alice] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    const czamaFactory = (await ethers.getContractFactory("ConfidentialZama")) as ConfidentialZama__factory;
    const cusdtFactory = (await ethers.getContractFactory("ConfidentialUSDT")) as ConfidentialUSDT__factory;

    czama = (await czamaFactory.deploy()) as ConfidentialZama;
    cusdt = (await cusdtFactory.deploy()) as ConfidentialUSDT;

    czamaAddress = await czama.getAddress();
    cusdtAddress = await cusdt.getAddress();

    const vaultFactory = (await ethers.getContractFactory("ShieldPadVault")) as ShieldPadVault__factory;
    vault = (await vaultFactory.deploy(czamaAddress, cusdtAddress)) as ShieldPadVault;
    vaultAddress = await vault.getAddress();

    await czama.setMinter(vaultAddress);
    await cusdt.setMinter(vaultAddress);
  });

  async function authorizeVaultOperators(holder: HardhatEthersSigner) {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
    await czama.connect(holder).setOperator(vaultAddress, expiry);
    await cusdt.connect(holder).setOperator(vaultAddress, expiry);
  }

  async function decryptValue(
    encryptedValue: string,
    contractAddress: string,
    signer: HardhatEthersSigner
  ): Promise<bigint> {
    return fhevm.userDecryptEuint(FhevmType.euint64, encryptedValue, contractAddress, signer);
  }

  it("allows a user to claim each token once", async function () {
    await expect(vault.connect(alice).claimCZama()).to.not.be.reverted;
    await expect(vault.connect(alice).claimCZama()).to.be.revertedWith("cZAMA already claimed");

    await expect(vault.connect(alice).claimCUSDT()).to.not.be.reverted;
    await expect(vault.connect(alice).claimCUSDT()).to.be.revertedWith("cUSDT already claimed");
  });

  it("stakes and unstakes encrypted cZAMA balances", async function () {
    await vault.connect(alice).claimCZama();
    await authorizeVaultOperators(alice);

    const stakeAmount = 100n * 10n ** 6n;
    const encryptedStake = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(stakeAmount)
      .encrypt();

    await vault.connect(alice).stakeCZama(encryptedStake.handles[0], encryptedStake.inputProof);

    const encryptedStakeBalance = await vault.getStakedBalance(alice.address);
    const clearStakeBalance = await decryptValue(encryptedStakeBalance, vaultAddress, alice);
    expect(clearStakeBalance).to.equal(stakeAmount);

    const encryptedUnstake = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(stakeAmount)
      .encrypt();

    await vault.connect(alice).unstakeCZama(encryptedUnstake.handles[0], encryptedUnstake.inputProof);

    const finalStakeBalance = await vault.getStakedBalance(alice.address);
    const clearFinalStake = await decryptValue(finalStakeBalance, vaultAddress, alice);
    expect(clearFinalStake).to.equal(0n);
  });

  it("borrows and repays cUSDT with encrypted operations", async function () {
    await vault.connect(alice).claimCZama();
    await authorizeVaultOperators(alice);

    const stakeAmount = 150n * 10n ** 6n;
    const borrowAmount = 40n * 10n ** 6n;

    const encryptedStake = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(stakeAmount)
      .encrypt();
    await vault.connect(alice).stakeCZama(encryptedStake.handles[0], encryptedStake.inputProof);

    const encryptedBorrow = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(borrowAmount)
      .encrypt();
    await vault.connect(alice).borrowCUSDT(encryptedBorrow.handles[0], encryptedBorrow.inputProof);

    const walletCusdtBalance = await cusdt.confidentialBalanceOf(alice.address);
    const clearBorrowed = await decryptValue(walletCusdtBalance, cusdtAddress, alice);
    expect(clearBorrowed).to.equal(borrowAmount);

    const encryptedRepay = await fhevm
      .createEncryptedInput(vaultAddress, alice.address)
      .add64(borrowAmount)
      .encrypt();
    await vault.connect(alice).repayCUSDT(encryptedRepay.handles[0], encryptedRepay.inputProof);

    const borrowedBalanceHandle = await vault.getBorrowedBalance(alice.address);
    const clearBorrowedBalance = await decryptValue(borrowedBalanceHandle, vaultAddress, alice);
    expect(clearBorrowedBalance).to.equal(0n);
  });
});
