// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "confidential-contracts-v91/contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ConfidentialUSDT is ERC7984, ZamaEthereumConfig, Ownable {
    address public minter;

    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    error UnauthorizedMinter(address caller);

    modifier onlyMinter() {
        if (msg.sender != minter) {
            revert UnauthorizedMinter(msg.sender);
        }
        _;
    }

    constructor() ERC7984("cUSDT", "cUSDT", "") Ownable(msg.sender) {
        minter = msg.sender;
    }

    function setMinter(address newMinter) external onlyOwner {
        address previous = minter;
        minter = newMinter;
        emit MinterUpdated(previous, newMinter);
    }

    function mintPlain(address to, uint64 amount) external onlyMinter returns (euint64) {
        euint64 encryptedAmount = FHE.asEuint64(amount);
        FHE.allow(encryptedAmount, address(this));
        euint64 minted = _mint(to, encryptedAmount);
        FHE.allow(minted, msg.sender);
        return minted;
    }

    function mintWithEncryptedAmount(address to, euint64 encryptedAmount) external onlyMinter returns (euint64) {
        require(FHE.isAllowed(encryptedAmount, msg.sender), "amount not available");
        FHE.allow(encryptedAmount, address(this));
        euint64 minted = _mint(to, encryptedAmount);
        FHE.allow(minted, msg.sender);
        return minted;
    }
}
