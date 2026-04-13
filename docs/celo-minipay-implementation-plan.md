# Celo + MiniPay Implementation Plan

## Scope
- Add a minimal onchain contract on Celo that **does not move funds**.
- Integrate MiniPay checkout support for Celo payments.
- Keep private keys out of source code and only in environment variables.

## 1) Safe Contract: `HedwigProofRegistry`
- Contract purpose: anchor hash-based proofs for document lifecycle events (for example, `DOCUMENT_PAID`).
- Security posture:
  - No token transfers.
  - No payable functions.
  - No external calls.
  - Owner + trusted-writer access control.
  - Immutable hash records via events and storage.

## 2) Project Interaction
- Backend now has an optional proof-anchoring hook:
  - On `POST /api/documents/:id/pay`, a hash proof can be written onchain.
  - This is controlled by `CELO_PROOF_REGISTRY_ENABLED=false` by default.
  - Failure to anchor proof does **not** block payment completion.

## 3) MiniPay Integration
- Public EVM checkout now:
  - Detects MiniPay (`window.ethereum.isMiniPay`).
  - Enforces Celo-only flow when MiniPay is the wallet context.
  - Exposes a MiniPay Add Cash deep link for smoother user funding.

## 4) Deploy + Verify
- Deploy command:
  - `npx hardhat run --config hedwig-backend/hardhat.config.cjs --network celo hedwig-backend/scripts/deploy-proof-registry.js`
- Celo Sepolia deploy command:
  - `npx hardhat run --config hedwig-backend/hardhat.config.cjs --network celoSepolia hedwig-backend/scripts/deploy-proof-registry.js`
- Verify command:
  - `npx hardhat verify --config hedwig-backend/hardhat.config.cjs --network celo <address> <owner> <writer>`
- Celo Sepolia verify command:
  - `npx hardhat verify --config hedwig-backend/hardhat.config.cjs --network celoSepolia <address> <owner> <writer>`
- Optional helper:
  - `npx hardhat run --config hedwig-backend/hardhat.config.cjs --network celo hedwig-backend/scripts/verify-proof-registry.js`

## 5) Secret Handling Rules
- Never hard-code private keys in any file.
- Use env vars only:
  - `CELO_DEPLOYER_PRIVATE_KEY`
  - `CELO_PROOF_REGISTRY_WRITER_PRIVATE_KEY`
  - `CELOSCAN_API_KEY`
- Rotate writer key if leaked and update trusted writer onchain.
