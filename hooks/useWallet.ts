/**
 * Wallet Hook - wraps SDK calls
 */

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWalletClient, useSignTypedData, useSendTransaction, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { getPrivacySDK } from '../sdk/privacy-sdk';
import {
  computeCommitment as atoshiComputeCommitment,
  deriveOwnerPubkey,
  randomBlinding,
  encryptNote,
  viewingPubKey,
  ChainScanner,
  RecoveredNote,
  BN254_FIELD_SIZE,
} from '@atoshi/privacy-sdk';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';

// EIP-712 typed-data kept strictly in sync with @atoshi/privacy-sdk (fixed, no timestamp)
// This way the signature produced by the same EOA is always identical, and the derived keys stay consistent across devices/sessions.
const ATOSHI_TYPED_DATA = {
  domain: { name: 'Atoshi Privacy', version: '1' },
  types: {
    AtoshiPrivacyKeyDerivation: [
      { name: 'purpose', type: 'string' },
      { name: 'version', type: 'uint256' },
    ],
  },
  primaryType: 'AtoshiPrivacyKeyDerivation' as const,
  message: {
    purpose:
      'Sign this message ONLY on the official Atoshi DApp to derive your privacy keys. ' +
      'DO NOT sign this on any other site — the signer can decrypt your notes.',
    version: 1n,
  },
};

// signature → seed (consistent with the SDK)
function _seedFromSignature(signatureHex: string): Uint8Array {
  const sigBytes = ethers.getBytes(signatureHex);
  if (sigBytes.length !== 65) throw new Error('signature must be 65 bytes');
  return ethers.getBytes(ethers.keccak256(sigBytes));
}

// HKDF-SHA256 derives 3 keys; the info strings are kept strictly identical to the SDK
function _deriveKeysFromSeed(seed: Uint8Array) {
  const enc = new TextEncoder();
  const sp = hkdf(sha256, seed, undefined, enc.encode('atoshi-privacy-v1:spending'), 32);
  const vw = hkdf(sha256, seed, undefined, enc.encode('atoshi-privacy-v1:viewing'), 32);
  const ek = hkdf(sha256, seed, undefined, enc.encode('atoshi-privacy-v1:encryption'), 32);
  const toBig = (b: Uint8Array): bigint => {
    let h = '0x';
    for (const x of b) h += x.toString(16).padStart(2, '0');
    return BigInt(h) % BN254_FIELD_SIZE;
  };
  return { spendingKey: toBig(sp), viewingKey: toBig(vw), encryptionKey: ek };
}
import {
  prepareAndProveUnshield,
  prepareAndProveTransfer,
} from '../sdk/zk-prover';

// Local helper: Uint8Array → 0x hex (the SDK doesn't export this, so write a one-liner)
const bytesToHex = (b: Uint8Array): string => {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
};
import { WalletState, Transaction, TransactionType, PrivacyKeys } from '../types';
import config from '../config';
import { atoshiL2 } from '../wagmi.config';

// Create a mock Signer that uses Wagmi's signTypedData
class WagmiSigner {
  private address: string;
  private signTypedDataFn: any;

  constructor(address: string, signTypedDataFn: any) {
    this.address = address;
    this.signTypedDataFn = signTypedDataFn;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signTypedData(domain: any, types: any, message: any): Promise<string> {
    const result = await this.signTypedDataFn({
      domain,
      types,
      message,
      primaryType: 'PrivacyActivation'
    });
    return result;
  }
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    publicBalance: '0 ATOSHI',
    privateBalance: '0 ATOSHI',
    address: '',
    privacyKeys: {
      spendingKey: '',
      viewingKey: '',
      publicAddress: '',
      isInitialized: false
    }
  });

  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [sdk] = useState(() => getPrivacySDK(config.l2.rpcUrl, config.contracts.shield));

  // Local Note state (mirrors localStorage's privacy_notes)
  // The UI reads this directly; refreshed after any shield/transfer/unshield/recover operation.
  const [localNotes, setLocalNotes] = useState<any[]>([]);

  // Recompute privateBalance + refresh localNotes state (called after any Note state change)
  const refreshPrivateState = () => {
    const notes = loadNotes();
    setLocalNotes(notes);
    const total = notes
      .filter((n: any) => !n.spent)
      .reduce((sum: bigint, n: any) => sum + BigInt(n.amount), 0n);
    setWallet(prev => ({
      ...prev,
      privateBalance: `${ethers.formatEther(total)} ATOSHI`,
    }));
  };

  // On startup + when walletClient changes, load Notes from localStorage to render the UI
  useEffect(() => {
    refreshPrivateState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletClient]);

  // When walletClient changes, update provider and signer
  useEffect(() => {
    const initProvider = async () => {
      if (walletClient && window.ethereum) {
        console.log('Initializing provider and signer...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        console.log('Signer initialized successfully:', await signer.getAddress());
        setProvider(provider);
        setSigner(signer);
        
        // Try to load previously saved privacy keys
        const savedKeys = localStorage.getItem('privacy_keys');
        if (savedKeys) {
          const keys = JSON.parse(savedKeys);
          setWallet(prev => ({ ...prev, privacyKeys: keys }));
          // Also set them into the SDK
          sdk.setPrivacyKeys(keys);
          console.log('Saved keys have been set into the SDK');
        }
      }
    };
    
    initProvider();
  }, [walletClient, sdk]);

  // Initialize privacy keys
  const initializePrivacy = async (): Promise<PrivacyKeys> => {
    console.log('initializePrivacy called');

    if (!walletClient) {
      throw new Error('Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)');
    }

    try {
      // ============================================================
      // ⭐ Key point: sign with @atoshi/privacy-sdk's fixed EIP-712 typed-data
      //   (the old SDK's deriveKeys derived using a timestamp, so the keys differed on every signature → funds locked up)
      //   Now we use the SDK standard approach: fixed typed-data + HKDF, so the same EOA always gets the same keys.
      // ============================================================
      const signature = await signTypedDataAsync({
        domain: ATOSHI_TYPED_DATA.domain,
        types: ATOSHI_TYPED_DATA.types,
        primaryType: ATOSHI_TYPED_DATA.primaryType,
        message: ATOSHI_TYPED_DATA.message,
      });
      console.log('[initializePrivacy] EIP-712 signature obtained');

      const seed = _seedFromSignature(signature);
      const derivedKeys = _deriveKeysFromSeed(seed);

      // Convert to the PrivacyKeys format used by the shield project UI (compatible with old field names)
      const spendingKey = derivedKeys.spendingKey.toString();
      const viewingKey = derivedKeys.viewingKey.toString();
      const ownerPubkey = await deriveOwnerPubkey(derivedKeys.spendingKey);

      const keys = {
        spendingKey,
        viewingKey,
        publicAddress: '0x' + ownerPubkey.toString(16).padStart(40, '0').slice(0, 40),  // truncated to 40 chars for display
        isInitialized: true,
      };

      // Generate "my privacy receiving code"
      try {
        const viewPub = viewingPubKey(derivedKeys.viewingKey);
        (keys as any).receivingCode = JSON.stringify({
          ownerPubkey: ownerPubkey.toString(),
          viewingPubKey: bytesToHex(viewPub),
        });
        console.log('[receivingCode]', (keys as any).receivingCode);
      } catch (e) {
        console.warn('Failed to generate receivingCode:', e);
      }

      // Save locally
      localStorage.setItem('privacy_keys', JSON.stringify(keys));
      setWallet(prev => ({ ...prev, privacyKeys: keys }));
      sdk.setPrivacyKeys(keys);
      console.log('[initializePrivacy] keys derived (fixed EIP-712, consistent across devices/sessions)');
      return keys;
    } catch (error) {
      console.error('Failed to initialize privacy keys:', error);
      throw error;
    }
  };

  // Update private balance
  const updatePrivateBalance = async () => {
    try {
      const balance = await sdk.getPrivateBalance();
      setWallet(prev => ({
        ...prev,
        privateBalance: `${ethers.formatEther(balance)} ATOSHI`
      }));
    } catch (error) {
      console.error('Failed to update private balance:', error);
    }
  };

  // Shield (deposit)
  const shield = async (amount: string): Promise<Transaction> => {
    if (!walletClient) {
      throw new Error('Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)');
    }

    try {
      // 1. Construct the Note with real Poseidon + ECIES and encrypt it
      //    Requires spendingKey / viewingKey: recovered from wallet.privacyKeys
      const spendingKey = BigInt(wallet.privacyKeys.spendingKey);
      const viewingKey = BigInt(wallet.privacyKeys.viewingKey);

      const amountWei = ethers.parseEther(amount);
      const tokenId = 0n; // NATIVE_TOKEN
      const blinding = randomBlinding();

      // commitment = Poseidon(amount, tokenId, ownerPubkey, blinding)
      const ownerPubkey = await deriveOwnerPubkey(spendingKey);
      const commitment = await atoshiComputeCommitment(amountWei, tokenId, ownerPubkey, blinding);

      // Encrypt the Note to yourself (so cross-device recovery can scan it back using viewingKey)
      const encryptedNote = await encryptNote(
        {
          amount: amountWei.toString(),
          tokenId: tokenId.toString(),
          blinding: blinding.toString(),
        },
        viewingPubKey(viewingKey)
      );

      // 2. Call Shield.deposit
      const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000' as const;
      const hash = await writeContractAsync({
        chain: atoshiL2,
        account: walletClient.account.address as `0x${string}`,
        address: config.contracts.shield as `0x${string}`,
        abi: [
          {
            name: 'deposit',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              { name: 'commitment', type: 'uint256' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'encryptedNote', type: 'bytes' }
            ],
            outputs: []
          }
        ] as const,
        functionName: 'deposit',
        args: [
          commitment,
          NATIVE_TOKEN,
          amountWei,
          bytesToHex(encryptedNote) as `0x${string}`,
        ],
        value: amountWei,
        gas: 1_500_000n,
        gasPrice: 2_000_000_000n,
      });

      // 3. Wait for the tx to be mined + parse leafIndex out of the Deposit event
      //    After a Shield deposit, knowing the leafIndex is required to Unshield / Transfer (used to compute the nullifier)
      //    Previously we stored -1 as a placeholder and waited for the user to recover manually, which was painful. Now we sync automatically.
      const receiptProvider = new ethers.JsonRpcProvider(
        config.l2.rpcUrl,
        { chainId: config.l2.chainId, name: 'atoshi-l2' },
        { batchMaxCount: 1, staticNetwork: true }
      );
      let leafIndex = -1;
      try {
        // Poll for the receipt (fork11 RPC may not return it immediately)
        let receipt = null;
        const deadline = Date.now() + 60_000;
        while (!receipt && Date.now() < deadline) {
          receipt = await receiptProvider.getTransactionReceipt(hash);
          if (!receipt) await new Promise(r => setTimeout(r, 1500));
        }
        if (receipt) {
          // Find the Deposit event (commitment is used as the indexed topic for matching)
          const depositTopic = ethers.id('Deposit(uint256,uint256,uint256,address,uint256,bytes)');
          const myCommitmentTopic = '0x' + commitment.toString(16).padStart(64, '0');
          const iface = new ethers.Interface([
            'event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp, address indexed token, uint256 amount, bytes encryptedNote)',
          ]);
          for (const log of receipt.logs) {
            if (log.topics[0] !== depositTopic) continue;
            if (log.topics[1]?.toLowerCase() !== myCommitmentTopic.toLowerCase()) continue;
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed) {
              leafIndex = Number(parsed.args.leafIndex);
              console.log(`[shield] leafIndex from event = ${leafIndex}`);
              break;
            }
          }
        }
      } catch (e) {
        console.warn('[shield] Failed to parse leafIndex, can only store -1; the user will need to manually Recover Note:', e);
      }

      // 4. Save the Note locally
      saveNote({
        amount: amountWei,
        secret: blinding.toString(),  // reuses the old field name for UI compatibility; actually stores the blinding
        nullifier: '',                // computed only when spending
        recipient: wallet.privacyKeys.publicAddress,
        spent: false,
        leafIndex,                    // ✓ real leafIndex, can directly Transfer/Unshield
        commitment: commitment.toString(),
      });

      return {
        id: hash,
        type: TransactionType.SHIELD,
        amount: `${amount} ATOSHI`,
        asset: 'ATOSHI',
        timestamp: Date.now(),
        from: walletClient.account.address,
        to: wallet.privacyKeys.publicAddress,
        status: 'completed',
        txHash: hash
      };
    } catch (error) {
      console.error('Shield failed:', error);
      throw error;
    }
  };

  // Cross-device recovery: scan the chain + decrypt Notes belonging to you
  // Key point: we must compute the real leafIndex for Notes received via Transfer (the contract's Transfer event has no leafIndex field,
  // but the Merkle tree increments in Deposit+Transfer chronological order. So scanning all events and counting in order is enough).
  const recoverNotesFromChain = async (): Promise<RecoveredNote[]> => {
    if (!wallet.privacyKeys?.isInitialized) {
      throw new Error('Please connect your wallet and sign first to derive your privacy identity');
    }
    const viewingKey = BigInt(wallet.privacyKeys.viewingKey);

    const provider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );

    const DEPOSIT_SIG = '0x6a03f0fec6477e3a9b9a4dfa0c5d4946db6de9070374844e2dd9e06626775375';
    const TRANSFER_SIG = '0x6b771087a455114922d19bd482d743c590e20ecd176b82b4e375c09584e0679b';
    const depositIface = new ethers.Interface([
      'event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp, address indexed token, uint256 amount, bytes encryptedNote)',
    ]);
    const transferIface = new ethers.Interface([
      'event Transfer(uint256 indexed nullifierHash, uint256 indexed newCommitment, bytes encryptedNote)',
    ]);

    // 1. Fetch all leaf-inserting events (Deposit + Transfer), sorted by [blockNumber, logIndex]
    const latest = await provider.getBlockNumber();
    const CHUNK = 9000;
    type Entry = {
      blockNumber: number;
      logIndex: number;
      txHash: string;
      kind: 'deposit' | 'transfer';
      commitment: bigint;
      encryptedNote: string;
      depositLeafIndex?: number;  // the leafIndex carried by the Deposit event itself
    };
    const entries: Entry[] = [];

    for (let from = 0; from <= latest; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, latest);
      // Fetch all Shield events in this range (without filtering on topic[0])
      const logs = await provider.getLogs({
        address: config.contracts.shield,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        try {
          if (log.topics[0] === DEPOSIT_SIG) {
            const parsed = depositIface.parseLog({ topics: log.topics as string[], data: log.data });
            if (!parsed) continue;
            entries.push({
              blockNumber: log.blockNumber,
              logIndex: log.index,
              txHash: log.transactionHash,
              kind: 'deposit',
              commitment: BigInt(parsed.args.commitment),
              encryptedNote: parsed.args.encryptedNote,
              depositLeafIndex: Number(parsed.args.leafIndex),
            });
          } else if (log.topics[0] === TRANSFER_SIG) {
            const parsed = transferIface.parseLog({ topics: log.topics as string[], data: log.data });
            if (!parsed) continue;
            entries.push({
              blockNumber: log.blockNumber,
              logIndex: log.index,
              txHash: log.transactionHash,
              kind: 'transfer',
              commitment: BigInt(parsed.args.newCommitment),
              encryptedNote: parsed.args.encryptedNote,
            });
          }
        } catch {}
      }
    }

    // 2. Sort strictly by (blockNumber, logIndex) — this is exactly the insertion order of the contract's Merkle tree
    entries.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return a.logIndex - b.logIndex;
    });

    // 3. Assign a leafIndex to each event (incrementing from 0). Also sanity check: the Deposit's own leafIndex must match.
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.kind === 'deposit' && e.depositLeafIndex !== undefined && e.depositLeafIndex !== i) {
        console.warn(
          `[recovery] leafIndex sanity check: entry[${i}] Deposit's own leafIndex=${e.depositLeafIndex} does not match chronological index ${i}! ` +
          `An event may be missing or the ordering is wrong. Continuing with i=${i}.`
        );
      }
    }

    // 4. Try to decrypt each encryptedNote with the viewingKey
    const { decryptNote } = await import('@atoshi/privacy-sdk');
    const hexToBytes = (hex: string): Uint8Array => {
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
      const out = new Uint8Array(clean.length / 2);
      for (let j = 0; j < out.length; j++) out[j] = parseInt(clean.slice(j * 2, j * 2 + 2), 16);
      return out;
    };

    const recovered: RecoveredNote[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.encryptedNote || e.encryptedNote === '0x' || e.encryptedNote.length <= 2) continue;
      const plaintext = await decryptNote(hexToBytes(e.encryptedNote), viewingKey);
      if (!plaintext) continue;
      recovered.push({
        commitment: e.commitment,
        leafIndex: i,            // ⭐ use the chronological index as the leafIndex (Deposit + Transfer share a unified numbering)
        blockNumber: e.blockNumber,
        txHash: e.txHash,
        source: e.kind,
        amount: BigInt(plaintext.amount),
        tokenId: BigInt(plaintext.tokenId),
        blinding: BigInt(plaintext.blinding),
      });
    }

    // 5. Merge into local storage (deduplicated by commitment)
    const existing = loadNotes();
    const existingCommitments = new Set(existing.map((n: any) => n.commitment));
    for (const note of recovered) {
      if (existingCommitments.has(note.commitment.toString())) continue;
      existing.push({
        amount: note.amount.toString(),
        secret: note.blinding.toString(),
        nullifier: '',
        recipient: wallet.privacyKeys.publicAddress,
        spent: false,
        leafIndex: note.leafIndex,
        commitment: note.commitment.toString(),
      });
    }
    localStorage.setItem('privacy_notes', JSON.stringify(existing));
    localStorage.setItem('last_scanned_block', latest.toString());
    refreshPrivateState();          // ⭐ UI refreshes immediately
    console.log(`[recovery] ${entries.length} leaf-inserting events total, recovered ${recovered.length} Notes belonging to you`);
    return recovered;
  };

  // The old generateNote / computeCommitment (using keccak as a placeholder) has been removed:
  // - Note construction uses randomBlinding + computeCommitment from sdk/atoshi-crypto.ts (real Poseidon)
  // - Inlined directly in the shield() flow (line 142-160)

  // Helper function: save a Note
  const saveNote = (note: any): void => {
    const notes = loadNotes();
    // Convert BigInt to string for serialization
    const serializedNote = {
      ...note,
      amount: note.amount.toString()
    };
    notes.push(serializedNote);
    localStorage.setItem('privacy_notes', JSON.stringify(notes));
    refreshPrivateState();    //  UI refreshes immediately (the new Note shows up in the Note list)
  };

  // Helper function: load Notes
  const loadNotes = (): any[] => {
    const stored = localStorage.getItem('privacy_notes');
    if (!stored) return [];
    
    try {
      const notes = JSON.parse(stored);
      // Keep all fields, convert amount back to BigInt
      // (Note: secret/commitment stay as decimal strings, converted with BigInt(...) when used)
      return notes.map((note: any) => ({
        ...note,
        amount: BigInt(note.amount),
      }));
    } catch (error) {
      console.error('Failed to load Notes:', error);
      return [];
    }
  };

  // Transfer (private → private) — real ZK proof + Shield.transfer
  //
  // The `to` parameter is Bob's "privacy receiving code", a JSON string (or base64-encoded), containing:
  //   { ownerPubkey: "...", viewingPubKey: "0x..." }
  //
  // After Bob runs Setup Privacy on his side, the wallet should display a QR code / copy button
  // so Bob can share these two public values with Alice. Alice scans/pastes them and then calls this function.
  //
  // Security: both ownerPubkey and viewingPubKey are public values, so sharing them does not leak Bob's funds.
  const privateSend = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) throw new Error('Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)');
    if (!wallet.privacyKeys?.isInitialized) throw new Error('Please initialize your privacy identity first');

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. Parse Bob's receiving code
    let bobOwnerPubkey: bigint;
    let bobViewingPubKey: Uint8Array;
    try {
      const trimmed = to.trim();
      // Supports two formats:
      //   A) JSON: {"ownerPubkey":"...","viewingPubKey":"0x..."}
      //   B) Simplified plain ownerPubkey (Bob hasn't shared the viewingPubKey yet, fallback to encrypting to yourself)
      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        if (!parsed.ownerPubkey || !parsed.viewingPubKey) {
          throw new Error('receiving code is missing fields');
        }
        bobOwnerPubkey = BigInt(parsed.ownerPubkey);
        const hex = parsed.viewingPubKey.startsWith('0x') ? parsed.viewingPubKey.slice(2) : parsed.viewingPubKey;
        bobViewingPubKey = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bobViewingPubKey.length; i++) {
          bobViewingPubKey[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        if (bobViewingPubKey.length !== 32) throw new Error('viewingPubKey must be 32 bytes');
      } else {
        // Fallback: the old format only has ownerPubkey, so encrypt to yourself (user fallback; Bob needs the Note delivered out of band)
        bobOwnerPubkey = BigInt(trimmed);
        bobViewingPubKey = viewingPubKey(BigInt(wallet.privacyKeys.viewingKey));
        console.warn('[transfer] receiving code has no viewingPubKey, encrypting to yourself (Bob will not receive a Note notification)');
      }
    } catch (e: any) {
      throw new Error(`Invalid receiving code: ${e?.message || e}`);
    }

    // 2. Pick a local Note with an equal amount
    const availableNotes = loadNotes().filter((n: any) => !n.spent);
    const matchingNotes = availableNotes.filter((n: any) => BigInt(n.amount) === amountWei);
    if (matchingNotes.length === 0) {
      if (availableNotes.length === 0) {
        throw new Error(
          `There are no Notes in the pool. Please Shield Funds first (e.g. Shield ${amount} ATOSHI),\n` +
          `then click "🔄 Recover Notes from chain" to sync the leafIndex,\n` +
          `then come back to transfer.`
        );
      }
      // List the amounts of the existing Notes
      const amountsList = availableNotes
        .map((n: any) => ethers.formatEther(n.amount))
        .join(', ');
      throw new Error(
        `There is no Note with amount = ${amount} ATOSHI in the pool.\n\n` +
        `V1 does not support change, so the Note amount must exactly equal the transfer amount.\n\n` +
        `Your currently available Note amounts: [${amountsList}] ATOSHI\n\n` +
        `Solution: Shield ${amount} ATOSHI first, then transfer.`
      );
    }
    const oldNote = matchingNotes[0];
    if (oldNote.leafIndex < 0) throw new Error('The Note has no confirmed leafIndex yet; please click "🔄 Recover Notes from chain" first');

    // 3. Construct the new Note (owner = Bob)
    const newBlinding = randomBlinding();
    const tokenId = 0n;
    const newCommitment = await atoshiComputeCommitment(amountWei, tokenId, bobOwnerPubkey, newBlinding);

    // Encrypt newNote to Bob (encrypted with Bob's viewingPubKey, so Bob can decrypt it when scanning the chain)
    // If the user didn't provide Bob's viewingPubKey, it falls back to Alice's own (already set during parsing above)
    const encryptedNote = await encryptNote(
      { amount: amountWei.toString(), tokenId: '0', blinding: newBlinding.toString() },
      bobViewingPubKey
    );

    // 4. Prepare the provider + generate the ZK proof
    const provider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );

    console.log('[transfer] Generating ZK proof...');
    const { proof, root, nullifierHash } = await prepareAndProveTransfer({
      provider,
      shieldAddress: config.contracts.shield,
      spendingKey,
      oldNote: {
        commitment: BigInt(oldNote.commitment),
        amount: BigInt(oldNote.amount),
        tokenId,
        blinding: BigInt(oldNote.secret),
        leafIndex: oldNote.leafIndex,
      },
      newOwnerPubkey: bobOwnerPubkey,
      newCommitment,
      newBlinding,
    }, (stage) => console.log('[transfer]', stage));

    // 5. Call Shield.transfer
    const hash = await writeContractAsync({
      chain: atoshiL2,
      account: walletClient.account.address as `0x${string}`,
      address: config.contracts.shield as `0x${string}`,
      abi: [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'pA', type: 'uint256[2]' },
            { name: 'pB', type: 'uint256[2][2]' },
            { name: 'pC', type: 'uint256[2]' },
            { name: 'root', type: 'uint256' },
            { name: 'nullifierHash', type: 'uint256' },
            { name: 'newCommitment', type: 'uint256' },
            { name: 'encryptedNote', type: 'bytes' },
          ],
          outputs: [],
        },
      ] as const,
      functionName: 'transfer',
      args: [
        [BigInt(proof.pA[0]), BigInt(proof.pA[1])],
        [
          [BigInt(proof.pB[0][0]), BigInt(proof.pB[0][1])],
          [BigInt(proof.pB[1][0]), BigInt(proof.pB[1][1])],
        ],
        [BigInt(proof.pC[0]), BigInt(proof.pC[1])],
        BigInt(root),
        BigInt(nullifierHash),
        newCommitment,
        bytesToHex(encryptedNote) as `0x${string}`,
      ],
      gas: 1_500_000n,
      gasPrice: 2_000_000_000n,
    });

    // 6. Mark the old Note as spent
    const notes = loadNotes();
    for (const n of notes) {
      if (n.commitment === oldNote.commitment) { n.spent = true; n.nullifier = nullifierHash; break; }
    }
    localStorage.setItem('privacy_notes', JSON.stringify(notes));
    refreshPrivateState();      // ⭐ UI refreshes immediately (old Note marked spent + balance decreases)

    return {
      id: hash,
      type: TransactionType.PRIVATE_SEND,
      amount: `${amount} ATOSHI`,
      asset: 'ATOSHI',
      timestamp: Date.now(),
      from: wallet.privacyKeys.publicAddress,
      to,
      status: 'completed',
      txHash: hash,
      nullifier: nullifierHash,
    };
  };

  // Unshield (private → public) — real ZK proof + Shield.withdraw
  const unshield = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) throw new Error('Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)');
    if (!wallet.privacyKeys?.isInitialized) throw new Error('Please initialize your privacy identity first');

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. Find a local Note that exactly matches the amount (V1 does not support change)
    const availableNotes = loadNotes().filter((n: any) => !n.spent);
    const matchingNotes = availableNotes.filter((n: any) => BigInt(n.amount) === amountWei);
    if (matchingNotes.length === 0) {
      if (availableNotes.length === 0) {
        throw new Error(
          `There are no Notes in the pool. Please Shield Funds ${amount} ATOSHI first,\n` +
          `then click "🔄 Recover Notes from chain", then come back to withdraw.`
        );
      }
      const amountsList = availableNotes
        .map((n: any) => ethers.formatEther(n.amount))
        .join(', ');
      throw new Error(
        `There is no Note with amount = ${amount} ATOSHI in the pool.\n\n` +
        `V1 does not support automatic change, so the Note amount must exactly equal the withdrawal amount.\n\n` +
        `Your currently available Note amounts: [${amountsList}] ATOSHI\n\n` +
        `Solution: withdraw the full amount of an existing Note instead, or Shield ${amount} ATOSHI first and then withdraw.`
      );
    }
    const note = matchingNotes[0];
    if (note.leafIndex < 0) throw new Error('The Note has no confirmed leafIndex yet (not found on chain); please click the "🔄 Recover Notes from chain" button first');

    // 2. Prepare the provider (fork11 compatible)
    const provider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );

    // 3. Rebuild the Merkle tree + generate the ZK proof (takes 10-30 seconds)
    console.log('[unshield] Starting ZK proof generation...');
    const { proof, root, nullifierHash } = await prepareAndProveUnshield({
      provider,
      shieldAddress: config.contracts.shield,
      spendingKey,
      note: {
        commitment: BigInt(note.commitment),
        amount: BigInt(note.amount),
        tokenId: 0n,
        blinding: BigInt(note.secret),  // the secret field actually stores the blinding
        leafIndex: note.leafIndex,
      },
      recipientAddress: to,
    }, (stage) => console.log('[unshield]', stage));

    // 4. Call Shield.withdraw
    const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000' as const;
    const hash = await writeContractAsync({
      chain: atoshiL2,
      account: walletClient.account.address as `0x${string}`,
      address: config.contracts.shield as `0x${string}`,
      abi: [
        {
          name: 'withdraw',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'pA', type: 'uint256[2]' },
            { name: 'pB', type: 'uint256[2][2]' },
            { name: 'pC', type: 'uint256[2]' },
            { name: 'root', type: 'uint256' },
            { name: 'nullifierHash', type: 'uint256' },
            { name: 'recipient', type: 'address' },
            { name: 'relayer', type: 'address' },
            { name: 'fee', type: 'uint256' },
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [],
        },
      ] as const,
      functionName: 'withdraw',
      args: [
        [BigInt(proof.pA[0]), BigInt(proof.pA[1])],
        [
          [BigInt(proof.pB[0][0]), BigInt(proof.pB[0][1])],
          [BigInt(proof.pB[1][0]), BigInt(proof.pB[1][1])],
        ],
        [BigInt(proof.pC[0]), BigInt(proof.pC[1])],
        BigInt(root),
        BigInt(nullifierHash),
        to as `0x${string}`,
        NATIVE_TOKEN,        // relayer: self-pay mode
        0n,                  // fee: self-pay
        NATIVE_TOKEN,
        amountWei,
      ],
      gas: 1_500_000n,
      gasPrice: 2_000_000_000n,
    });

    // 5. Mark the Note as spent locally
    const notes = loadNotes();
    for (const n of notes) {
      if (n.commitment === note.commitment) { n.spent = true; n.nullifier = nullifierHash; break; }
    }
    localStorage.setItem('privacy_notes', JSON.stringify(notes));
    refreshPrivateState();      // ⭐ UI refreshes immediately (Note marked spent + Private Balance decreases)

    return {
      id: hash,
      type: TransactionType.UNSHIELD,
      amount: `${amount} ATOSHI`,
      asset: 'ATOSHI',
      timestamp: Date.now(),
      from: wallet.privacyKeys.publicAddress,
      to,
      status: 'completed',
      txHash: hash,
      nullifier: nullifierHash,
    };
  };

  // Regular transfer
  const transfer = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) {
      throw new Error('Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)');
    }

    try {
      // Use Wagmi's sendTransaction
      // ⚠️ fork11 L2 only accepts Type 0 (legacy) txs, it does not accept EIP-1559 (Type 2)
      // type: 'legacy' must be set explicitly, otherwise wagmi defaults to Type 2 → "invalid sender" error
      const hash = await sendTransactionAsync({
        to: to as `0x${string}`,
        value: parseEther(amount),
        gas: 21000n,
        gasPrice: 2_000_000_000n,  // 2 gwei (consistent with Shield/Unshield)
        type: 'legacy',             // ⭐ required for fork11
      });

      // Wait for the transaction to be confirmed
      if (provider) {
        await provider.waitForTransaction(hash);
      }

      return {
        id: hash,
        type: TransactionType.TRANSFER,
        amount: `${amount} ATOSHI`,
        asset: 'ATOSHI',
        timestamp: Date.now(),
        from: walletClient.account.address,
        to,
        status: 'completed',
        txHash: hash
      };
    } catch (error) {
      console.error('Transfer failed:', error);
      throw error;
    }
  };

  return {
    wallet,
    initializePrivacy,
    shield,
    privateSend,
    unshield,
    transfer,
    updatePrivateBalance,
    recoverNotesFromChain,    // Cross-device recovery: scan all Deposits from the chain and use viewingKey to decrypt Notes belonging to you
    localNotes,               // Local Note list (for UI rendering)
    refreshPrivateState,      // Manually refresh the UI after any Note change (already called automatically inside shield/transfer/unshield/recover)
  };
}
