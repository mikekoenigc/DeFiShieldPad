# DeFi ShieldPad

DeFi ShieldPad is a confidential staking and borrowing protocol that runs on Zama’s FHEVM. Users claim privacy-preserving starter balances (cZAMA and cUSDT), stake cZAMA as collateral, borrow cUSDT against that encrypted collateral, and decrypt balances locally only when they need clear-text visibility. All state transitions stay encrypted on-chain while the front end uses Zama’s relayer to handle encryption and decryption.

## Why It Matters
- Keeps collateral, wallet, and debt positions encrypted on-chain to prevent MEV targeting and balance leakage.
- Users can still operate like a normal DeFi app (claim, stake, borrow, repay) without exposing amounts to the network.
- Fully homomorphic operations allow the vault to enforce business logic without ever needing plaintext values.
- Developer flow mirrors a standard Hardhat stack while layering in FHE primitives, keeping the project approachable.

## Core Features
- **Confidential faucets:** One-click mint of starter cZAMA and cUSDT allocations via the vault.
- **Private staking:** Stake cZAMA with encrypted amounts; vault tracks encrypted collateral balances per user.
- **Borrow/repay cUSDT:** Draw and repay cUSDT loans against the encrypted stake without revealing size.
- **Local decryption on demand:** Users request decryption of wallet, stake, and debt balances through the Zama relayer and view clear amounts in the UI.
- **Operator authorization:** One-time permission flow to let the vault move encrypted token balances for staking/repayment.

## Architecture at a Glance
- **ShieldPadVault (contracts/ShieldPadVault.sol):** Coordinates claims, staking, borrowing, and repayments; stores encrypted balances and shares ciphertext handles only with allowed parties.
- **ConfidentialZama & ConfidentialUSDT (contracts/ConfidentialZama.sol, contracts/ConfidentialUSDT.sol):** ERC7984 confidential tokens; vault is the designated minter for faucet mints and loan issuance.
- **Deploy script (deploy/deploy.ts):** Deploys both tokens and the vault, then assigns the vault as minter for each token.
- **Front end (app/):** React + Vite + RainbowKit UI. viem powers all reads; ethers is used for writes. Encryption/decryption flows run through `@zama-fhe/relayer-sdk` (see `app/src/hooks/useZamaInstance.ts`).
- **ABIs & addresses:** Contract ABIs are sourced from `deployments/sepolia`. The UI contract addresses live in `app/src/config/contracts.ts` and should be updated whenever new deployments are made.

## Tech Stack
- Solidity 0.8.27, Hardhat, hardhat-deploy, TypeChain
- Zama FHEVM plugin and `confidential-contracts` (ERC7984)
- TypeScript across contracts and front end
- React + Vite + RainbowKit + wagmi/viem for reads, ethers v6 for writes
- Zama relayer SDK for encryption and client-side decryption

## Problems Solved & Advantages
- **Privacy-first DeFi:** Encrypted balances remove the usual transparency that enables copy-trading and targeted liquidations.
- **Usability parity:** Users follow familiar DeFi flows (claim, stake, borrow, repay) with minimal extra steps.
- **Deterministic permissions:** Operator approvals are explicit, time-bound, and isolated to the vault.
- **Auditability without leakage:** Events emit encrypted amounts so behavior is traceable while values remain private.

## Getting Started

### Prerequisites
- Node.js 20+
- npm
- Infura API key for Sepolia RPC access
- Private key for deployments (no mnemonics; keep it hex-formatted without the leading `0x`)

### Backend (contracts)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with:
   ```
   PRIVATE_KEY=your_private_key_without_0x
   INFURA_API_KEY=your_infura_key
   ETHERSCAN_API_KEY=optional_for_verification
   ```
3. Compile and test:
   ```bash
   npm run compile
   npm run test
   ```
4. Run a local FHE-ready node if you want local iteration:
   ```bash
   npx hardhat node
   ```
5. Deploy:
   ```bash
   # Local
   npx hardhat deploy --network hardhat

   # Sepolia
   npx hardhat deploy --network sepolia
   ```
6. After deploying, copy the generated ABIs from `deployments/<network>/` into the front-end config (the repository keeps them in `app/src/config/abis.ts`) and update the addresses in `app/src/config/contracts.ts` to the newest deployment. Always use contract-generated ABIs—no manual edits.

### Front End (app)
1. Install dependencies:
   ```bash
   cd app
   npm install
   ```
2. Start the app:
   ```bash
   npm run dev
   ```
3. The UI is configured for Sepolia. Ensure `app/src/config/contracts.ts` points to the deployed vault and token addresses you want to use. Do not introduce environment variables; addresses are stored directly in the config file.
4. Connect a wallet in RainbowKit, authorize the protocol, claim starter balances, then stake/borrow/repay with encrypted amounts. Use the “Decrypt” buttons to view clear balances locally.

### Directory Layout
- `contracts/`: ShieldPadVault and confidential token implementations
- `deploy/`: Hardhat-deploy scripts
- `deployments/`: Network-specific deployment artifacts and ABIs
- `tasks/`: Custom Hardhat tasks (e.g., account listing)
- `test/`: Contract test suite
- `app/`: React + Vite front end (no Tailwind, viem for reads, ethers for writes)
- `docs/`: Zama protocol references for the relayer and LLM tooling

## Roadmap
- Add interest-rate logic, health factor tracking, and automated liquidation safeguards.
- Support additional collateral types and cross-market borrowing.
- Enhanced observability: client-side notifications for stake/loan health and relayer status.
- Formal audits and fuzzing of encrypted arithmetic paths.
- Optional batched transactions to reduce overhead while preserving confidentiality.

## Testing & Quality
- Run `npm run test` for the contract suite.
- Use `npm run coverage` for solidity-coverage when needed.
- Front-end flows rely on the Zama relayer; ensure it is reachable when testing decryption.

## License

This project is licensed under the BSD-3-Clause-Clear License. See `LICENSE` for details.
