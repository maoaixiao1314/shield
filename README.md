# Atoshi Privacy Wallet (H5)

Privacy-preserving wallet for the Atoshi network: deposits public ATOSHI into
a Tornado-Cash-style commitment pool, performs zero-knowledge private transfers,
and unshields back to a public address — all on Atoshi L2 (chain `67890`).

Also integrates the L1 ↔ L2 bridge so users can deposit native ATOSHI from L1
(chain `88288`) directly into the privacy pool, and unshield back the same way.

---

## Quick start

```bash
# 1. clone + install
git clone <repo-url>
cd shield
npm install

# 2. configure
cp .env.example .env
# edit .env — see "Environment variables" below

# 3. run dev server
npm run dev
# → http://localhost:3000
```

Open the URL, connect MetaMask, and switch to the **Atoshi L2** network
(chain id `67890`, RPC `https://l2-rpc1-testnet.atoshi.org` — see `.env`).

---

## Features

| Section | Feature | Status |
|---------|---------|--------|
| Public  | Send ATOSHI (plain transfer)             | ✓ |
| Public  | Shield Funds (public → private deposit)  | ✓ |
| Public  | Bridge L1 → L2 (cross-chain)             | ✓ |
| Private | Private Send (private → private transfer) | ✓ |
| Private | Unshield (private → public withdraw)     | ✓ |
| Private | View my privacy receiving code (QR)      | ✓ |
| Private | Recover notes from chain (re-scan)       | ✓ |
| History | Transaction history persisted (localStorage, per address) | ✓ |
| History | Tx hash auto-truncated in UI             | ✓ |

L2 → L1 unshield (bridge withdraw) requires the ZK aggregator + prover and is
**disabled on testnet** until the dedicated prover server is provisioned.
The UI may show the action but the underlying tx will not be mined.

---

## Environment variables

`.env` (override `.env.example` defaults):

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_L2_RPC_URL`           | Atoshi L2 RPC endpoint              | `https://l2-rpc1-testnet.atoshi.org` |
| `VITE_L2_CHAIN_ID`          | Atoshi L2 chain id                  | `67890` |
| `VITE_L1_RPC_URL`           | Atoshi L1 RPC (for bridge UI)       | `https://rpc-testnet.atoshi.org` |
| `VITE_L1_CHAIN_ID`          | Atoshi L1 chain id                  | `88288` |
| `VITE_WC_PROJECT_ID`        | WalletConnect Project ID (get one at https://cloud.reown.com) | — |
| `VITE_SHIELD_CONTRACT`      | Shield contract on L2               | `0x4A951a4Bc79F156c0658d71675dcC5b2348E95DB` |
| `VITE_L1_BRIDGE_CONTRACT`   | PolygonZkEVMBridge on L1            | `0xC241A13b93b3969e15303c194520Fc2f950F7F4b` |
| `VITE_L2_BRIDGE_CONTRACT`   | PolygonZkEVMBridge on L2            | `0x0101481FA81E3044934CD905d322f4F5f116cc55` |
| `VITE_BRIDGE_SERVICE_URL`   | zkevm-bridge-service REST API       | `http://52.76.210.218:8080` |

Only `VITE_WC_PROJECT_ID` is required — every other variable has a working
default for testnet.

---

## Architecture

```
H5 (this repo)
  │
  ├─ wagmi + viem + RainbowKit  ──→ MetaMask (user wallet)
  │
  ├─ @atoshi/privacy-sdk         ──→ key derivation, encrypted notes,
  │                                   Poseidon commitments, EIP-712 signing
  │
  ├─ snarkjs (WASM)              ──→ ZK proof generation in browser
  │     ├─ Shield (deposit)        no proof needed
  │     ├─ Transfer (private send) Groth16 BN254
  │     └─ Unshield (withdraw)     Groth16 BN254
  │
  └─ JsonRpcProvider             ──→ Atoshi L2 + L1 RPC
        │
        ├─ on L2:
        │    Shield contract (deposit / transfer / withdraw)
        │    L2 PolygonZkEVMBridge (auto-claim of L1→L2 deposits)
        │
        └─ on L1:
             L1 PolygonZkEVMBridge (bridgeAsset for L1→L2 deposits)
             zkevm-bridge-service REST API (proofs, claim status)
```

### Privacy primitives

- **Commitment** = `Poseidon(amount, tokenId, ownerPubkey, blinding)`
  Inserted into a 32-level Poseidon Merkle tree on the Shield contract.

- **Nullifier**  = `Poseidon(commitment, spendingKey, leafIndex)`
  Emitted on spend so the contract can mark the note as spent (without
  revealing which leaf it was).

- **Encrypted note**: `AES-256-GCM(viewingKey-derived key, plaintext)`
  Plaintext = `{amount, tokenId, blinding}`. Emitted on chain so the
  recipient can scan + decrypt all notes addressed to them.

- **Privacy keys**:
  - `spendingKey` — used to sign / spend notes
  - `viewingKey`  — used to scan / decrypt encrypted notes (delegate to a
    watcher without spend authority)
  Both derived deterministically from one EIP-712 signature of the user's
  EOA, so the same wallet always re-derives the same keys (no seed phrase).

### Bridge flow (L1 → L2, with auto-claim)

```
User on L1 → bridgeAsset(amount) → L1 bridge contract (locks funds)
                                       │
                                       ▼
                    L2 sequencer detects new L1 GlobalExitRoot
                                       │
                                       ▼
                       L2 bridge contract (mint authorized)
                                       │
                                       ▼
                  claimtxmanager bot (in bridge-service)
                  auto-submits claimAsset() on L2,
                  pays L2 gas for the user
                                       │
                                       ▼
                  User receives ATOSHI on L2 (~3–4 minutes total)
```

The H5 polls `${VITE_BRIDGE_SERVICE_URL}/bridges/<addr>` until
`claim_tx_hash` is non-empty, then shows a success toast.

---

## Project structure

```
shield/
├─ App.tsx                       Root component + transaction history state
├─ components/
│  ├─ ActionModal.tsx            Modal for Send / Shield / Transfer / Unshield / Bridge
│  ├─ Header.tsx                 Top bar (chain switch, wallet connect)
│  ├─ HistoryItem.tsx            Single tx history row (truncated hash, status)
│  ├─ PrivateDashboard.tsx       Private balance, ZK keys, privacy receiving QR
│  ├─ PublicDashboard.tsx        Public balance, Shield Funds + Bridge actions
│  ├─ SetupPrivacy.tsx           One-click privacy key derivation (EIP-712 sign)
│  ├─ Toast.tsx                  Top-right notification system
│  └─ …
├─ hooks/
│  └─ useWallet.ts               Main hook: balance, shield, transfer, unshield,
│                                bridgeDeposit, pollBridgeStatus, …
├─ sdk/
│  ├─ privacy-sdk.ts             High-level Shield SDK wrapper
│  ├─ zk-prover.ts               Browser-side ZK proof generation
│  ├─ BRIDGE_ABI.json            PolygonZkEVMBridge ABI (full)
│  └─ …
├─ config.ts                     L1 + L2 chain config, contract addresses
├─ types.ts                      TransactionType enum, WalletState, …
├─ wagmi.config.ts               atoshiL2 chain definition for wagmi
└─ .env.example
```

---

## Known compatibility patches (Atoshi-specific)

Atoshi L2 is a Polygon CDK fork (`v0.7.0-fork11-atoshi`). A few defaults
don't match MetaMask / viem assumptions; we work around them here:

| File | Patch | Reason |
|------|-------|--------|
| `hooks/useWallet.ts` | All `writeContractAsync` calls pass `type: 'legacy'` | Atoshi L2 pool rejects EIP-1559 (type 2) txs with `"RPC submit: invalid sender"`. viem auto-picks type 2 once `block.baseFeePerGas` is present, so we force legacy. |
| `App.tsx` `handleInitializePrivacy` | `throw` instead of `try/catch` swallowing the error | Otherwise the SetupPrivacy wizard advances to a fake "Keys Secured" screen when the user clicks **Reject** on the wallet signature prompt. |

Both patches are documented in inline code comments. **Do not remove them
unless the corresponding zkevm-node side is also upgraded** (fork12+).

---

## Develop

```bash
npm run dev      # vite dev server (port 3000)
npm run build    # production bundle into dist/
npm run preview  # preview the production bundle locally
```

### Common dev workflows

- **Reset privacy state**: open browser DevTools console, run
  `localStorage.clear()` then reload. This wipes notes, transaction
  history, and forces a fresh EIP-712 signature.
- **Recover notes from chain**: in the Private dashboard, click
  **🔄 Recover Notes from chain**. Useful after clearing localStorage or
  switching devices — re-scans `Shield` events and decrypts any notes
  belonging to the current viewing key.
- **Switch L2 RPC**: edit `.env`'s `VITE_L2_RPC_URL` and restart `npm run dev`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `MetaMask shows "失败" but H5 shows ✓` | Old bug pre-baseFeePerGas patch on zkevm-node — should not happen on current testnet | Upgrade L2 RPC container; verify `curl eth_getBlockByNumber` returns `"baseFeePerGas": "0x0"` |
| `RPC submit: invalid sender` on Shield/Transfer/Unshield | `type: 'legacy'` missing on the writeContract call | Add it (see comment in `useWallet.ts` line 350) |
| `Keys Secured` shown after user rejected signature | Old App.tsx logic | Already fixed — verify `handleInitializePrivacy` throws on failure |
| `MerkleTreeChecker_217 line: 57` on Unshield/Transfer | No notes in pool (you never successfully shielded) or note's `leafIndex` is stale | Do a fresh Shield first; or click **Recover Notes from chain** to rebuild local state |
| Bridge claim never completes (`ready_for_claim=true` but `claim_tx_hash=""`) | claimtxmanager bot has no L2 gas | Fund `0xe1c7af0ea76ce8971728d455b25aef5412750ca1` on L2 |

---

## License

Internal — Atoshi only.
