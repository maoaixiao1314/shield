# Atoshi Privacy Wallet - Complete Technical Guide

## 📦 Project Structure

```
shield/
├── sdk/
│   ├── privacy-sdk.ts       # Core SDK (key derivation, transactions)
│   └── wasm-prover.ts       # WASM Prover wrapper
├── hooks/
│   └── useWallet.ts         # React Hook (connect wallet, call SDK)
├── components/              # UI components
├── config.ts                # Configuration file
├── types.ts                 # TypeScript type definitions
└── App.tsx                  # Main application
```

---

## 🔐 Privacy Circuit Explained

### **What is a Privacy Circuit?**

A privacy circuit is a system of mathematical constraints used to generate zero-knowledge proofs (ZK Proofs).

**Core Concepts:**

```
┌─────────────────────────────────────────────────────────────┐
│  Privacy Circuit = Proof System                             │
│                                                             │
│  Goal: prove "I know a secret" without revealing the secret │
│                                                             │
│  Example: private transfer                                  │
│  ┌───────────────────────────────────────────────────┐    │
│  │ I want to prove:                                   │    │
│  │ ✅ I have a Note (worth 100 ATOS)                 │    │
│  │ ✅ This Note is in the Merkle Tree                │    │
│  │ ✅ I have the corresponding Spending Key          │    │
│  │ ✅ I haven't spent it (Nullifier unused)          │    │
│  │                                                    │    │
│  │ But without telling you:                           │    │
│  │ ❌ The exact contents of the Note                  │    │
│  │ ❌ My Spending Key                                 │    │
│  │ ❌ Who I'm sending to                              │    │
│  │ ❌ The amount                                      │    │
│  └───────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

### **Circuit Workflow**

```
User action: send 50 ATOS to Bob

Step 1: Prepare inputs (locally in the wallet)
┌─────────────────────────────────────────┐
│ Private Inputs:                          │
│ • My Note (amount, secret, nullifier)    │
│ • My Spending Key                       │
│ • Merkle Proof                          │
│                                         │
│ Public Inputs:                           │
│ • Merkle Root                           │
│ • Nullifier Hash                        │
│ • Recipient public key                   │
└─────────────────────────────────────────┘
         ↓
Step 2: Run the circuit (Prover)
┌─────────────────────────────────────────┐
│ Circuit verifies:                        │
│ ✅ Note is in the Merkle Tree           │
│ ✅ Spending Key is correct              │
│ ✅ Amount is conserved                   │
│ ✅ Nullifier computed correctly         │
│                                         │
│ Output: ZK Proof (a string of numbers)   │
└─────────────────────────────────────────┘
         ↓
Step 3: Submit on-chain
┌─────────────────────────────────────────┐
│ Submit:                                  │
│ • ZK Proof                              │
│ • Nullifier Hash                        │
│ • New Merkle Root                       │
│                                         │
│ Do not submit:                           │
│ • Note contents                         │
│ • Spending Key                          │
│ • Amount, recipient                      │
└─────────────────────────────────────────┘
         ↓
Step 4: On-chain verification (Verifier contract)
┌─────────────────────────────────────────┐
│ Contract verifies:                       │
│ ✅ Is the Proof valid?                  │
│ ✅ Is the Nullifier unused?             │
│ ✅ Is the Merkle Root correct?          │
│                                         │
│ All pass → transaction succeeds          │
└─────────────────────────────────────────┘
```

---

## 🚀 Two Prover Deployment Options

### **Option A: Browser WASM Prover (currently used)**

```
┌─────────────────────────────────────────────────────────┐
│ Pros:                                                    │
│ ✅ No additional server required                         │
│ ✅ Maximizes user privacy (proof generated locally)      │
│ ✅ Simple to deploy                                      │
│                                                          │
│ Cons:                                                    │
│ ❌ Slow first load (downloads WASM, around 5-10MB)       │
│ ❌ Slow proof generation (browser performance limits, around 5-30 seconds) │
│                                                          │
│ How to start:                                            │
│ • No separate startup needed!                            │
│ • WASM downloaded automatically when the frontend loads  │
│ • Runs automatically when the user clicks "Send"         │
│                                                          │
│ Use cases:                                               │
│ • Demos                                                  │
│ • Low-frequency transactions                             │
│ • Privacy-conscious users                                │
└─────────────────────────────────────────────────────────┘
```

### **Option B: Standalone Prover Service (recommended for production)**

```
┌─────────────────────────────────────────────────────────┐
│ Pros:                                                    │
│ ✅ Fast proof generation (strong server performance, around 1-5 seconds) │
│ ✅ Supports batch processing                             │
│ ✅ Supports recursive proofs                             │
│                                                          │
│ Cons:                                                    │
│ ❌ Requires an additional server                         │
│ ❌ Users must trust the Prover                           │
│                                                          │
│ How to start:                                            │
│ cd ~/atoshi-privacy-circuits                            │
│ npm run build:circuits                                  │
│ npm run setup                                           │
│ npm run start:prover                                    │
│                                                          │
│ Use cases:                                               │
│ • Production environments                                │
│ • High-frequency transactions                            │
│ • When fast responses are required                       │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Current Completion Status

### **Completed:**

- [x] SDK wrapper (privacy-sdk.ts)
  - [x] Key derivation (based on EIP-712 signatures)
  - [x] Shield (deposit)
  - [x] Private transfer
  - [x] Unshield (withdrawal)
  - [x] Note management
  - [x] Local storage

- [x] WASM Prover wrapper (wasm-prover.ts)
  - [x] Proof generation interface
  - [x] Local verification
  - [x] Mock implementation (for demos)

- [x] React Hook (useWallet.ts)
  - [x] Connect wallet
  - [x] Initialize privacy keys
  - [x] Call SDK methods
  - [x] Demo mode support

- [x] Configuration files
  - [x] Environment variable configuration
  - [x] L2 RPC configuration
  - [x] Contract address configuration

### **To Do:**

- [ ] Connect frontend components to the SDK
  - [ ] Modify SetupPrivacy.tsx (call initializePrivacy)
  - [ ] Modify ActionModal.tsx (call shield/privateSend/unshield)
  - [ ] Add loading states and error handling

- [ ] Real circuit integration
  - [ ] Compile the Circom circuit
  - [ ] Generate the WASM file
  - [ ] Replace the mock Prover

- [ ] Contract deployment
  - [ ] Deploy the Shield contract
  - [ ] Deploy the Verifier contract
  - [ ] Update the configuration files

---

## 🎯 Next Steps

### **What you can do today:**

1. **Test the frontend (demo mode)**
   ```bash
   cd ~/shield
   npm install
   npm run dev
   ```
   Visit http://localhost:5173

2. **Test key derivation**
   - Connect MetaMask
   - Switch to "Private Assets"
   - Click "Activate Privacy"
   - View the derived keys

3. **Test the UI flow**
   - Shield (deposit)
   - Private transfer
   - Unshield (withdrawal)
   - View transaction history

### **Tomorrow, after ops opens the port:**

1. **Deploy the contracts**
   ```bash
   cd ~/atoshi-privacy-contracts
   npx hardhat run scripts/deploy-shield.ts --network l2
   ```

2. **Update the configuration**
   ```bash
   # Fill in the contract address in .env.local
   VITE_SHIELD_CONTRACT=0x...
   VITE_DEMO_MODE=false
   ```

3. **Real testing**
   - Connect to L2
   - Initiate a real transaction
   - Inspect the on-chain data

---

## 💡 Key Q&A

### **Q1: Does the circuit need to be started separately?**

**A:** It depends on the option:
- **WASM Prover (current)**: No! The frontend loads it automatically
- **Standalone Prover Service**: Yes! Start it on the server

### **Q2: Is the SDK wrapper complete?**

**A:** Yes! It includes:
- ✅ Key derivation
- ✅ All transaction types
- ✅ Note management
- ✅ Demo mode

### **Q3: Can it be demoed now?**

**A:** Yes! In demo mode:
- ✅ All UI interactions work
- ✅ Key derivation runs for real
- ✅ The transaction flow is fully demonstrated
- ❌ It won't actually call the contracts (pending contract deployment)

### **Q4: What is a privacy circuit?**

**A:** 
- A set of mathematical rules (a constraint system)
- Used to generate zero-knowledge proofs
- Proves "I know a secret" without revealing the secret
- Runs in a Prover (browser or server)

---

## 📞 Need Help?

If you run into issues:
1. Check the configuration: `cat .env.local`
2. Check the logs: the browser console
3. Test the RPC: `curl http://54.169.30.130:8123`

**You can start testing the frontend now!** 🚀
