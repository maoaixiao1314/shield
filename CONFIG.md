# Atoshi Privacy Wallet - Configuration Guide

## Environment Variable Configuration

Create a `.env.local` file in the project root directory:

```bash
# L2 RPC configuration
VITE_L2_RPC_URL=http://54.169.30.130:8123
VITE_L2_CHAIN_ID=67890

# Contract addresses (fill in after deployment)
VITE_SHIELD_CONTRACT=0x0000000000000000000000000000000000000000
VITE_VERIFIER_CONTRACT=0x0000000000000000000000000000000000000000

# Prover configuration
VITE_PROVER_URL=http://localhost:8080
VITE_USE_WASM_PROVER=true

# Demo mode (uses mock data when the contract is not deployed)
VITE_DEMO_MODE=true
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the configuration above into the `.env.local` file

### 3. Start the development server

```bash
npm run dev
```

Visit http://localhost:5173

## Demo Mode Notes

When `VITE_DEMO_MODE=true`:
- ✅ You can test all UI interactions
- ✅ You can test key derivation
- ✅ Uses mock transaction data
- ❌ Will not actually call the contract

After the contract is deployed:
1. Update the `VITE_SHIELD_CONTRACT` address
2. Set `VITE_DEMO_MODE=false`
3. Restart the development server

## Connecting MetaMask

1. Open MetaMask
2. Add a custom network:
   - Network name: Atoshi L2
   - RPC URL: http://54.169.30.130:8123
   - Chain ID: 67890
   - Currency symbol: ETH
3. Refresh the page and click "Connect Wallet"

## Feature Testing Checklist

### ✅ Currently testable (demo mode)
- [x] Connect wallet
- [x] View public balance
- [x] Privacy key derivation
- [x] UI interaction flow
- [x] Transaction history display

### ⏳ Awaiting contract deployment
- [ ] Shield (deposit)
- [ ] Private transfer
- [ ] Unshield (withdrawal)
- [ ] On-chain data queries

