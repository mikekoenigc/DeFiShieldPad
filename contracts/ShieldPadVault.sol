// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {FHESafeMath} from "confidential-contracts-v91/contracts/utils/FHESafeMath.sol";
import {ConfidentialZama} from "./ConfidentialZama.sol";
import {ConfidentialUSDT} from "./ConfidentialUSDT.sol";

contract ShieldPadVault is ZamaEthereumConfig {
    ConfidentialZama public immutable czama;
    ConfidentialUSDT public immutable cusdt;

    uint64 public constant CZAMA_CLAIM_AMOUNT = 1_000 * 1e6;
    uint64 public constant CUSDT_CLAIM_AMOUNT = 500 * 1e6;

    mapping(address => bool) public hasClaimedCZAMA;
    mapping(address => bool) public hasClaimedCUSDT;
    mapping(address => euint64) private _stakedBalances;
    mapping(address => euint64) private _borrowedBalances;

    event ClaimedCZama(address indexed user, uint64 amount);
    event ClaimedCUSDT(address indexed user, uint64 amount);
    event StakedCZama(address indexed user, euint64 encryptedAmount);
    event UnstakedCZama(address indexed user, euint64 encryptedAmount);
    event BorrowedCUSDT(address indexed user, euint64 encryptedAmount);
    event RepaidCUSDT(address indexed user, euint64 encryptedAmount);

    constructor(address czamaAddress, address cusdtAddress) {
        require(czamaAddress != address(0) && cusdtAddress != address(0), "invalid token address");
        czama = ConfidentialZama(czamaAddress);
        cusdt = ConfidentialUSDT(cusdtAddress);
    }

    function claimCZama() external returns (euint64) {
        require(!hasClaimedCZAMA[msg.sender], "cZAMA already claimed");
        hasClaimedCZAMA[msg.sender] = true;
        euint64 minted = czama.mintPlain(msg.sender, CZAMA_CLAIM_AMOUNT);
        emit ClaimedCZama(msg.sender, CZAMA_CLAIM_AMOUNT);
        return minted;
    }

    function claimCUSDT() external returns (euint64) {
        require(!hasClaimedCUSDT[msg.sender], "cUSDT already claimed");
        hasClaimedCUSDT[msg.sender] = true;
        euint64 minted = cusdt.mintPlain(msg.sender, CUSDT_CLAIM_AMOUNT);
        emit ClaimedCUSDT(msg.sender, CUSDT_CLAIM_AMOUNT);
        return minted;
    }

    function stakeCZama(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _shareWithContract(amount, address(czama));
        euint64 transferred = czama.confidentialTransferFrom(msg.sender, address(this), amount);
        euint64 updatedBalance = FHE.add(_stakedBalances[msg.sender], transferred);
        _shareWithUser(msg.sender, updatedBalance);
        _stakedBalances[msg.sender] = updatedBalance;
        emit StakedCZama(msg.sender, transferred);
        return updatedBalance;
    }

    function unstakeCZama(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        (ebool success, euint64 updatedBalance) = FHESafeMath.tryDecrease(_stakedBalances[msg.sender], amount);
        euint64 transferable = FHE.select(success, amount, FHE.asEuint64(0));
        _shareWithUser(msg.sender, updatedBalance);
        _stakedBalances[msg.sender] = updatedBalance;
        _shareWithContract(transferable, address(czama));
        euint64 transferred = czama.confidentialTransfer(msg.sender, transferable);
        emit UnstakedCZama(msg.sender, transferred);
        return updatedBalance;
    }

    function borrowCUSDT(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64) {
        require(FHE.isInitialized(_stakedBalances[msg.sender]), "stake before borrowing");
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _shareWithContract(amount, address(cusdt));
        euint64 minted = cusdt.mintWithEncryptedAmount(msg.sender, amount);
        euint64 updatedBorrow = FHE.add(_borrowedBalances[msg.sender], minted);
        _shareWithUser(msg.sender, updatedBorrow);
        _borrowedBalances[msg.sender] = updatedBorrow;
        emit BorrowedCUSDT(msg.sender, minted);
        return updatedBorrow;
    }

    function repayCUSDT(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64) {
        require(FHE.isInitialized(_borrowedBalances[msg.sender]), "no active borrow");
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _shareWithContract(amount, address(cusdt));
        euint64 transferred = cusdt.confidentialTransferFrom(msg.sender, address(this), amount);
        ( , euint64 updatedBorrow) = FHESafeMath.tryDecrease(_borrowedBalances[msg.sender], transferred);
        _shareWithUser(msg.sender, updatedBorrow);
        _borrowedBalances[msg.sender] = updatedBorrow;
        emit RepaidCUSDT(msg.sender, transferred);
        return updatedBorrow;
    }

    function getStakedBalance(address user) external view returns (euint64) {
        return _stakedBalances[user];
    }

    function getBorrowedBalance(address user) external view returns (euint64) {
        return _borrowedBalances[user];
    }

    function _shareWithUser(address user, euint64 value) private {
        FHE.allowThis(value);
        FHE.allow(value, user);
    }

    function _shareWithContract(euint64 value, address target) private {
        if (FHE.isInitialized(value)) {
            FHE.allow(value, target);
        }
    }
}
