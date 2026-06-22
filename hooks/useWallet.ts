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
  computeNullifier,
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
  prepareAndProveShield,
} from '../sdk/zk-prover';
import { formatAmountWithSuffix } from '../utils/amount-formatter';

// Local helper: Uint8Array → 0x hex (the SDK doesn't export this, so write a one-liner)
const bytesToHex = (b: Uint8Array): string => {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
};
import { WalletState, Transaction, TransactionType, PrivacyKeys } from '../types';
import config from '../config';
import { atoshiL2 } from '../wagmi.config';

// Bridge ABI - extracted from BRIDGE_ABI.json for better compatibility
const BRIDGE_ABI = [
  {
    "inputs": [
      { "internalType": "uint32", "name": "destinationNetwork", "type": "uint32" },
      { "internalType": "address", "name": "destinationAddress", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "bool", "name": "forceUpdateGlobalExitRoot", "type": "bool" },
      { "internalType": "bytes", "name": "permitData", "type": "bytes" }
    ],
    "name": "bridgeAsset",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32[32]", "name": "smtProof", "type": "bytes32[32]" },
      { "internalType": "uint32", "name": "index", "type": "uint32" },
      { "internalType": "bytes32", "name": "mainnetExitRoot", "type": "bytes32" },
      { "internalType": "bytes32", "name": "rollupExitRoot", "type": "bytes32" },
      { "internalType": "uint32", "name": "originNetwork", "type": "uint32" },
      { "internalType": "address", "name": "originTokenAddress", "type": "address" },
      { "internalType": "uint32", "name": "destinationNetwork", "type": "uint32" },
      { "internalType": "address", "name": "destinationAddress", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "bytes", "name": "metadata", "type": "bytes" }
    ],
    "name": "claimAsset",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

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
    publicBalance: '0 ATOS',
    privateBalance: '0 ATOS',
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

  // Helper function to check if wallet is connected and get the address
  const ensureWalletConnected = async (): Promise<string> => {
    // Check both wagmi's walletClient and window.ethereum for better compatibility
    if (walletClient && walletClient.account) {
      return walletClient.account.address;
    }

    // Fallback: use window.ethereum directly
    if ((window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          return accounts[0];
        }
      } catch (error) {
        console.error('[ensureWalletConnected] Failed to get accounts:', error);
      }
    }

    throw new Error('Please connect your wallet first');
  };

  // Helper function to get current wallet address (sync version)
  const getCurrentAddress = (): string => {
    if (walletClient && walletClient.account) {
      return walletClient.account.address;
    }
    // This will be set by ensureWalletConnected before calling this function
    throw new Error('Wallet not connected');
  };

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
    // Format with precision rules (2 decimals max, hide trailing zeros, floor)
    const formattedBalance = formatAmountWithSuffix(total, true);
    console.log('[Private Balance Refresh] Refreshing private balance:', {
      totalNotes: notes.length,
      unspentNotes: notes.filter((n: any) => !n.spent).length,
      totalWei: total.toString(),
      formatted: formattedBalance,
      timestamp: new Date().toISOString()
    });
    setWallet(prev => ({
      ...prev,
      privateBalance: formattedBalance,
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

    ensureWalletConnected();

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
      // Format with precision rules (2 decimals max, hide trailing zeros, floor)
      const formattedBalance = formatAmountWithSuffix(balance, true);
      setWallet(prev => ({
        ...prev,
        privateBalance: formattedBalance
      }));
    } catch (error) {
      console.error('Failed to update private balance:', error);
    }
  };

  // Shield (deposit)
  const shield = async (amount: string): Promise<Transaction> => {
    const accountAddress = await ensureWalletConnected();

    try {
      // Ensure we're on L2 chain before executing transaction
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l2ChainIdHex = '0x' + config.l2.chainId.toString(16);

      if (currentChainId !== l2ChainIdHex) {
        console.log('[shield] Switching to L2 chain...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l2ChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l2ChainIdHex,
                chainName: config.l2.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l2.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

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

      // 2. Generate the deposit ZK proof. Audit Issue 2: Shield.deposit
      //    now binds (amount, tokenId) into the commitment via this proof
      //    so an attacker can't deposit 1 wei but commit 1000 tokens.
      //    The shield circuit is small (~550 constraints) — proof gen
      //    typically completes in 1-5s on a phone.
      console.log('[shield] Generating deposit proof...');
      const { proof: shieldProof } = await prepareAndProveShield({
        amount: amountWei,
        tokenId,
        ownerPubkey,
        blinding,
        commitment,
      });

      // 3. Call Shield.deposit with the new ABI (audit Issue 2)
      const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000' as const;
      const hash = await writeContractAsync({
        chain: atoshiL2,
        account: accountAddress as `0x${string}`,
        address: config.contracts.shield as `0x${string}`,
        abi: [
          {
            name: 'deposit',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              { name: 'pA', type: 'uint256[2]' },
              { name: 'pB', type: 'uint256[2][2]' },
              { name: 'pC', type: 'uint256[2]' },
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
          [BigInt(shieldProof.pA[0]), BigInt(shieldProof.pA[1])],
          [
            [BigInt(shieldProof.pB[0][0]), BigInt(shieldProof.pB[0][1])],
            [BigInt(shieldProof.pB[1][0]), BigInt(shieldProof.pB[1][1])],
          ],
          [BigInt(shieldProof.pC[0]), BigInt(shieldProof.pC[1])],
          commitment,
          NATIVE_TOKEN,
          amountWei,
          bytesToHex(encryptedNote) as `0x${string}`,
        ],
        value: amountWei,
        gas: 1_500_000n,
        gasPrice: 2_000_000_000n,
        type: 'legacy',  // fork11 pool only accepts type-0; viem otherwise picks EIP-1559 once block.baseFeePerGas appears, pool rejects with "RPC submit: invalid sender"
      });

      // 3. Wait for the transaction to be confirmed and parse leafIndex from the Deposit event
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

      console.log('[Shield] Transaction confirmed, refreshing private balance immediately...');
      // Refresh private balance after successful transaction
      refreshPrivateState();

      return {
        id: hash,
        type: TransactionType.SHIELD,
        amount: formatAmountWithSuffix(amount),
        asset: 'ATOStest',
        timestamp: Date.now(),
        from: accountAddress,
        to: wallet.privacyKeys.publicAddress,
        status: 'completed',
        txHash: hash
      };
    } catch (error) {
      console.error('Shield failed:', error);

      // Provide user-friendly error messages for ZK proof errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Assert Failed') || errorMessage.includes('MerkleTreeChecker')) {
        throw new Error(
          '零知识证明生成失败。可能原因：\n' +
          '1. Note 的 leafIndex 不正确\n' +
          '2. Merkle tree 状态与链上不同步\n' +
          '3. Spending key 错误\n\n' +
          '请尝试：\n' +
          '• 点击“🔄 从链上恢复 Notes”同步最新状态\n' +
          '• 重新执行屏蔽资金操作获取新的 Note'
        );
      }

      if (errorMessage.includes('signal is aborted') || errorMessage.includes('aborted without reason')) {
        throw new Error(
          '网络请求被中断。可能原因：\n' +
          '1. RPC 节点响应超时\n' +
          '2. 网络连接不稳定\n' +
          '3. ZK 证明生成时间过长导致超时\n\n' +
          '请检查网络连接后重试。'
        );
      }

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
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

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

    // Audit Q4: derive ownerPubkey once so we can re-hash the decrypted
    // (amount, tokenId, ownerPubkey, blinding) into a fresh commitment and
    // verify it equals the chain commitment. Notes whose recomputed
    // commitment doesn't match are forged (someone broadcast an
    // encryptedNote with inflated amount to phish the user's wallet) and
    // must be dropped — otherwise the H5 displays a phantom balance.
    const ownerPubkey = await deriveOwnerPubkey(spendingKey);

    const recovered: RecoveredNote[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.encryptedNote || e.encryptedNote === '0x' || e.encryptedNote.length <= 2) continue;
      const plaintext = await decryptNote(hexToBytes(e.encryptedNote), viewingKey);
      if (!plaintext) continue;

      const amount = BigInt(plaintext.amount);
      const tokenId = BigInt(plaintext.tokenId);
      const blinding = BigInt(plaintext.blinding);
      // Q4 check: drop the entry silently if commitment doesn't match.
      const recomputed = await atoshiComputeCommitment(amount, tokenId, ownerPubkey, blinding);
      if (recomputed !== e.commitment) continue;

      recovered.push({
        commitment: e.commitment,
        leafIndex: i,            // ⭐ use the chronological index as the leafIndex (Deposit + Transfer share a unified numbering)
        blockNumber: e.blockNumber,
        txHash: e.txHash,
        source: e.kind,
        amount,
        tokenId,
        blinding,
      });
    }

    // 5. Cross-check each recovered Note's nullifier against the on-chain
    //    spent set BEFORE inserting it into local storage.
    //
    //    Without this check, the recovery flow has a "fake balance" failure
    //    mode on a fresh device / cleared cache:
    //      - localStorage is empty → the dedupe at step 6 doesn't filter
    //        anything → every decryptable Note from the chain (including
    //        the ones the user already spent in past sessions) gets pushed
    //        in with `spent: false`.
    //      - The UI computes balance as Σ amount over `spent === false`,
    //        so the user sees an inflated balance.
    //      - The first attempt to spend an already-spent Note reverts on
    //        the contract (`Shield: already spent`), but the UI lied up
    //        to that point — bad for OTC / lending / display trust.
    //
    //    Fix: compute Poseidon(commitment, spendingKey, leafIndex) for each
    //    recovered Note and query Shield.isSpent(uint256). Any Note whose
    //    nullifier is already on-chain is stored as `spent: true` so it
    //    stays out of the balance calculation but is still visible if a
    //    future UI wants to render a "spent history" view.
    const shieldRO = new ethers.Contract(
      config.contracts.shield,
      ['function isSpent(uint256 nullifierHash) view returns (bool)'],
      provider,
    );
    const spentFlags: boolean[] = new Array(recovered.length).fill(false);
    for (let k = 0; k < recovered.length; k++) {
      const note = recovered[k];
      try {
        const nf = await computeNullifier(note.commitment, spendingKey, note.leafIndex);
        spentFlags[k] = await shieldRO.isSpent(nf);
      } catch (err) {
        // If the chain query fails (transient RPC issue), fall back to
        // `spent: false`. The user's next spend attempt will still hit
        // the on-chain check, so we don't risk allowing a double-spend —
        // worst case the UI shows a slightly inflated balance until the
        // next successful recovery.
        console.warn(`[recovery] isSpent check failed for leafIndex=${note.leafIndex}, defaulting to unspent:`, err);
      }
    }
    const spentCount = spentFlags.filter(Boolean).length;

    // 6. Replace local storage with chain data (overwrite, not merge)
    // This ensures spent status is synced and removes stale/invalid notes
    const notesToSave = recovered.map((note, k) => ({
      amount: note.amount.toString(),
      secret: note.blinding.toString(),
      nullifier: '',
      recipient: wallet.privacyKeys.publicAddress,
      spent: spentFlags[k],
      leafIndex: note.leafIndex,
      commitment: note.commitment.toString(),
    }));
    
    localStorage.setItem('privacy_notes', JSON.stringify(notesToSave));
    localStorage.setItem('last_scanned_block', latest.toString());
    refreshPrivateState();          // ⭐ UI refreshes immediately
    console.log(
      `[recovery] ${entries.length} leaf-inserting events total, ` +
      `recovered ${recovered.length} Notes belonging to you ` +
      `(${recovered.length - spentCount} unspent, ${spentCount} already spent on-chain). ` +
      `Local storage has been overwritten with chain data.`,
    );
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
    // Relayer mode: relayer EOA submits the tx, so we don't need the
    // user's address here. Still call ensureWalletConnected() so the
    // user has authorized the dApp and we can read their privacy keys.
    await ensureWalletConnected();
    if (!wallet.privacyKeys?.isInitialized) throw new Error('Please initialize your privacy identity first');

    try {
      // Ensure we're on L2 chain before executing transaction
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l2ChainIdHex = '0x' + config.l2.chainId.toString(16);

      if (currentChainId !== l2ChainIdHex) {
        console.log('[privateSend] Switching to L2 chain...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l2ChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l2ChainIdHex,
                chainName: config.l2.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l2.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }
    } catch (switchError) {
      console.error('[privateSend] Failed to switch to L2:', switchError);
      throw new Error('Failed to switch to L2 chain. Please switch manually.');
    }

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. Parse Bob's receiving code
    //
    // ⚠️ Only the JSON receiving code is accepted. The previous fallback
    // that treated raw bigint input as ownerPubkey is REMOVED. Pasting a
    // 0x EVM address used to be silently accepted (BigInt('0x...') parses
    // it as a uint256, indistinguishable in-circuit from a real hash-
    // pubkey), the proof passed, the source note was nullified on-chain,
    // and a new commitment was created whose owner was the EVM address —
    // nobody has the spendingKey satisfying Poseidon(spendingKey) ==
    // EVM_address, so the funds were permanently locked. The error users
    // hit on the next spend attempt was "Error in template
    // MerkleTreeChecker..." — the recovered note's commitment is re-
    // derived with the sender's real ownerPubkey and no longer matches
    // the on-chain commitment.
    let bobOwnerPubkey: bigint;
    let bobViewingPubKey: Uint8Array;
    try {
      const trimmed = to.trim();
      if (!trimmed.startsWith('{')) {
        throw new Error(
          'Invalid receiving code. Use the JSON privacy receiving code generated by the recipient via "Setup Privacy" — NOT a 0x EVM address. Pasting an EVM address will cause permanent loss of funds.\n\nExpected format: {"ownerPubkey":"...","viewingPubKey":"0x..."}'
        );
      }
      const parsed = JSON.parse(trimmed);
      if (!parsed.ownerPubkey || !parsed.viewingPubKey) {
        throw new Error('Receiving code is missing required fields (ownerPubkey, viewingPubKey).');
      }
      bobOwnerPubkey = BigInt(parsed.ownerPubkey);
      // Reject obviously-invalid pubkey values (must be a non-zero BN254 field element)
      const BN254_MOD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      if (bobOwnerPubkey === 0n || bobOwnerPubkey >= BN254_MOD) {
        throw new Error('ownerPubkey is not a valid BN254 field element (must be > 0 and < BN254 modulus).');
      }
      const hex = parsed.viewingPubKey.startsWith('0x') ? parsed.viewingPubKey.slice(2) : parsed.viewingPubKey;
      bobViewingPubKey = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bobViewingPubKey.length; i++) {
        bobViewingPubKey[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      if (bobViewingPubKey.length !== 32) {
        throw new Error('viewingPubKey must be 32 bytes.');
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('JSON') && !msg.includes('Invalid receiving code')) {
        throw new Error(`Receiving code is not valid JSON.\n\n${msg}`);
      }
      throw e;
    }

    // 2. Pick a local Note with an equal amount
    const availableNotes = loadNotes().filter((n: any) => !n.spent);
    const matchingNotes = availableNotes.filter((n: any) => BigInt(n.amount) === amountWei);
    if (matchingNotes.length === 0) {
      if (availableNotes.length === 0) {
        throw new Error(
          `There are no Notes in the pool. Please Shield Funds first (e.g. Shield ${amount} ATOS),\n` +
          `then click "🔄 Recover Notes from chain" to sync the leafIndex,\n` +
          `then come back to transfer.`
        );
      }
      // List the amounts of the existing Notes
      const amountsList = availableNotes
        .map((n: any) => ethers.formatEther(n.amount))
        .join(', ');
      throw new Error(
        `There is no Note with amount = ${amount} ATOS in the pool.\n\n` +
        `V1 does not support change, so the Note amount must exactly equal the transfer amount.\n\n` +
        `Your currently available Note amounts: [${amountsList}] ATOS\n\n` +
        `Solution: Shield ${amount} ATOS first, then transfer.`
      );
    }
    const oldNote = matchingNotes[0];
    if (oldNote.leafIndex < 0) throw new Error('The Note has no confirmed leafIndex yet; please click "🔄 Recover Notes from chain" first');

    // Debug: log note details before proof generation
    console.log('[privateSend] Using note for transfer:', {
      commitment: oldNote.commitment.toString(),
      amount: ethers.formatEther(oldNote.amount),
      leafIndex: oldNote.leafIndex,
      secret: oldNote.secret,
      spent: oldNote.spent
    });

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
    let proofResult;
    try {
      proofResult = await prepareAndProveTransfer({
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
    } catch (error) {
      console.error('ZK proof generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Assert Failed') || errorMessage.includes('MerkleTreeChecker')) {
        throw new Error(
          '零知识证明生成失败。可能原因：\n' +
          '1. Note 的 leafIndex 不正确\n' +
          '2. Merkle tree 状态与链上不同步\n' +
          '3. Spending key 错误\n\n' +
          '请尝试：\n' +
          '• 点击“🔄 从链上恢复 Notes”同步最新状态\n' +
          '• 重新执行屏蔽资金操作获取新的 Note'
        );
      }

      if (errorMessage.includes('signal is aborted') || errorMessage.includes('aborted without reason')) {
        throw new Error(
          '网络请求被中断。可能原因：\n' +
          '1. RPC 节点响应超时\n' +
          '2. 网络连接不稳定\n' +
          '3. ZK 证明生成时间过长导致超时\n\n' +
          '请检查网络连接后重试。'
        );
      }

      throw error;
    }

    const { proof, root, nullifierHash } = proofResult;

    // 5. Submit through the privacy relayer. Shield.transfer has no
    //    _relayer field (no fee distribution), so anyone can submit a
    //    valid proof — we route through the relayer purely to keep the
    //    user's wallet address off the L2 receipt, which is what
    //    audit Q8 requires for full sender privacy.
    const relayerUrl = import.meta.env.VITE_RELAYER_URL as string;
    if (!relayerUrl) {
      throw new Error('VITE_RELAYER_URL must be set');
    }

    console.log('[transfer] Submitting proof to relayer', relayerUrl);
    const relayResp = await fetch(`${relayerUrl}/relay/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proof: {
          pA: [proof.pA[0].toString(), proof.pA[1].toString()],
          pB: [
            [proof.pB[0][0].toString(), proof.pB[0][1].toString()],
            [proof.pB[1][0].toString(), proof.pB[1][1].toString()],
          ],
          pC: [proof.pC[0].toString(), proof.pC[1].toString()],
        },
        publicSignals: {
          root: root.toString(),
          nullifierHash: nullifierHash.toString(),
          newCommitment: newCommitment.toString(),
        },
        encryptedNote: bytesToHex(encryptedNote),
      }),
    });

    if (!relayResp.ok) {
      const errText = await relayResp.text();
      let errJson: any = null;
      try { errJson = JSON.parse(errText); } catch { /* not JSON */ }
      throw new Error(`Relayer rejected transfer (${relayResp.status}): ${errJson?.error || errText}`);
    }
    const { txHash } = await relayResp.json();
    if (!txHash) throw new Error('Relayer accepted proof but returned no txHash');
    const hash = txHash as string;

    // 6. Wait for the transaction to be confirmed
    console.log('[transfer] Waiting for transaction confirmation...');
    const receiptProvider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );
    let receipt = null;
    const deadline = Date.now() + 60_000;
    while (!receipt && Date.now() < deadline) {
      receipt = await receiptProvider.getTransactionReceipt(hash);
      if (!receipt) await new Promise(r => setTimeout(r, 1500));
    }
    console.log('[transfer] Transaction confirmed:', hash);

    // 7. Mark the old Note as spent
    const notes = loadNotes();
    for (const n of notes) {
      if (n.commitment === oldNote.commitment) { n.spent = true; n.nullifier = nullifierHash; break; }
    }
    localStorage.setItem('privacy_notes', JSON.stringify(notes));
    console.log('[PrivateSend] Transaction confirmed, refreshing private balance immediately...');
    refreshPrivateState();      // ⭐ UI refreshes immediately (old Note marked spent + balance decreases)

    return {
      id: hash,
      type: TransactionType.PRIVATE_SEND,
      amount: formatAmountWithSuffix(amount),
      asset: 'ATOStest',
      timestamp: Date.now(),
      from: wallet.privacyKeys.publicAddress,
      to,
      status: 'completed',
      txHash: hash,
      nullifier: nullifierHash,
    };
  };

  // Unshield (private → public) — real ZK proof + Shield.withdraw via relayer
  const unshield = async (amount: string, to: string): Promise<Transaction> => {
    // Relayer mode: relayer EOA submits the withdraw tx, so the user's
    // wallet address never appears as msg.sender on-chain. Still call
    // ensureWalletConnected() to confirm the dApp is authorized and to
    // unlock the privacy keys.
    await ensureWalletConnected();
    if (!wallet.privacyKeys?.isInitialized) throw new Error('Please initialize your privacy identity first');

    try {
      // Ensure we're on L2 chain before executing transaction
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l2ChainIdHex = '0x' + config.l2.chainId.toString(16);

      if (currentChainId !== l2ChainIdHex) {
        console.log('[unshield] Switching to L2 chain...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l2ChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l2ChainIdHex,
                chainName: config.l2.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l2.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }
    } catch (switchError) {
      console.error('[unshield] Failed to switch to L2:', switchError);
      throw new Error('Failed to switch to L2 chain. Please switch manually.');
    }

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. Find a local Note that exactly matches the amount (V1 does not support change)
    const availableNotes = loadNotes().filter((n: any) => !n.spent);
    const matchingNotes = availableNotes.filter((n: any) => BigInt(n.amount) === amountWei);
    if (matchingNotes.length === 0) {
      if (availableNotes.length === 0) {
        throw new Error(
          `There are no Notes in the pool. Please Shield Funds ${amount} ATOS first,\n` +
          `then click "🔄 Recover Notes from chain", then come back to withdraw.`
        );
      }
      const amountsList = availableNotes
        .map((n: any) => ethers.formatEther(n.amount))
        .join(', ');
      throw new Error(
        `There is no Note with amount = ${amount} ATOS in the pool.\n\n` +
        `V1 does not support automatic change, so the Note amount must exactly equal the withdrawal amount.\n\n` +
        `Your currently available Note amounts: [${amountsList}] ATOS\n\n` +
        `Solution: withdraw the full amount of an existing Note instead, or Shield ${amount} ATOS first and then withdraw.`
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
    let proofResult;
    try {
      proofResult = await prepareAndProveUnshield({
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
        // Relayer mode (audit Q8): bind the relayer's L2 EOA into the
        // proof's `_relayer` public input so an attacker can't intercept
        // the proof and reroute the fee to themselves. fee=0 because the
        // testnet relayer covers gas as a service; production sets a
        // non-zero fee paid in the withdrawn token.
        relayerAddress: import.meta.env.VITE_RELAYER_ADDRESS as string,
        fee: 0n,
      }, (stage) => console.log('[unshield]', stage));
    } catch (error) {
      console.error('ZK proof generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Assert Failed') || errorMessage.includes('MerkleTreeChecker')) {
        throw new Error(
          '零知识证明生成失败。可能原因：\n' +
          '1. Note 的 leafIndex 不正确\n' +
          '2. Merkle tree 状态与链上不同步\n' +
          '3. Spending key 错误\n\n' +
          '请尝试：\n' +
          '• 点击“🔄 从链上恢复 Notes”同步最新状态\n' +
          '• 重新执行屏蔽资金操作获取新的 Note'
        );
      }

      if (errorMessage.includes('signal is aborted') || errorMessage.includes('aborted without reason')) {
        throw new Error(
          '网络请求被中断。可能原因：\n' +
          '1. RPC 节点响应超时\n' +
          '2. 网络连接不稳定\n' +
          '3. ZK 证明生成时间过长导致超时\n\n' +
          '请检查网络连接后重试。'
        );
      }

      throw error;
    }

    const { proof, root, nullifierHash } = proofResult;

    // 4. Submit through the privacy relayer instead of signing locally.
    //    The relayer holds its own L2 EOA, validates that the proof's
    //    `_relayer` field matches its address (audit Issue 3 / 4), then
    //    calls Shield.withdraw and pays the L2 gas. The user's wallet
    //    address never appears as msg.sender for this tx, which is
    //    audit Q8's whole point.
    const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000' as const;
    const relayerUrl = import.meta.env.VITE_RELAYER_URL as string;
    const relayerAddr = import.meta.env.VITE_RELAYER_ADDRESS as string;
    if (!relayerUrl || !relayerAddr) {
      throw new Error('VITE_RELAYER_URL and VITE_RELAYER_ADDRESS must be set');
    }

    console.log('[unshield] Submitting proof to relayer', relayerUrl);
    const relayResp = await fetch(`${relayerUrl}/relay/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proof: {
          pA: [proof.pA[0].toString(), proof.pA[1].toString()],
          pB: [
            [proof.pB[0][0].toString(), proof.pB[0][1].toString()],
            [proof.pB[1][0].toString(), proof.pB[1][1].toString()],
          ],
          pC: [proof.pC[0].toString(), proof.pC[1].toString()],
        },
        publicSignals: {
          root: root.toString(),
          nullifierHash: nullifierHash.toString(),
          recipient: to,
          relayer: relayerAddr,
          amount: amountWei.toString(),
          fee: '0',
        },
        token: NATIVE_TOKEN,
      }),
    });

    if (!relayResp.ok) {
      const errText = await relayResp.text();
      let errJson: any = null;
      try { errJson = JSON.parse(errText); } catch { /* not JSON */ }
      throw new Error(`Relayer rejected withdraw (${relayResp.status}): ${errJson?.error || errText}`);
    }
    const { txHash } = await relayResp.json();
    if (!txHash) throw new Error('Relayer accepted proof but returned no txHash');
    const hash = txHash as string;

    // 6. Wait for the transaction to be confirmed
    console.log('[unshield] Waiting for transaction confirmation...');
    const receiptProvider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );
    let receipt = null;
    const deadline = Date.now() + 60_000;
    while (!receipt && Date.now() < deadline) {
      receipt = await receiptProvider.getTransactionReceipt(hash);
      if (!receipt) await new Promise(r => setTimeout(r, 1500));
    }
    console.log('[unshield] Transaction confirmed:', hash);

    // 7. Mark the Note as spent locally
    const notes = loadNotes();
    for (const n of notes) {
      if (n.commitment === note.commitment) { n.spent = true; n.nullifier = nullifierHash; break; }
    }
    localStorage.setItem('privacy_notes', JSON.stringify(notes));
    console.log('[Unshield] Transaction confirmed, refreshing private balance immediately...');
    refreshPrivateState();      // ⭐ UI refreshes immediately (Note marked spent + Private Balance decreases)

    return {
      id: hash,
      type: TransactionType.UNSHIELD,
      amount: formatAmountWithSuffix(amount),
      asset: 'ATOStest',
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
    const accountAddress = await ensureWalletConnected();

    try {
      // Ensure we're on L2 chain before executing transaction
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l2ChainIdHex = '0x' + config.l2.chainId.toString(16);

      if (currentChainId !== l2ChainIdHex) {
        console.log('[transfer] Switching to L2 chain...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l2ChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l2ChainIdHex,
                chainName: config.l2.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l2.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      // Use Wagmi's sendTransaction
      // ⚠️ fork11 L2 only accepts Type 0 (legacy) txs, it does not accept EIP-1559 (Type 2)
      // type: 'legacy' must be set explicitly, otherwise wagmi defaults to Type 2 → "invalid sender" error
      const hash = await sendTransactionAsync({
        to: to as `0x${string}`,
        value: parseEther(amount),
        gas: 21000n,
        gasPrice: 2_000_000_000n,  // 2 gwei (consistent with Shield/Unshield)
        type: 'legacy',             // ⭐ required for fork11
        account: accountAddress as `0x${string}`,  // Add account parameter
      });

      // Wait for the transaction to be confirmed
      if (provider) {
        await provider.waitForTransaction(hash);
      }

      console.log('[Transfer] Transaction confirmed');

      return {
        id: hash,
        type: TransactionType.TRANSFER,
        amount: formatAmountWithSuffix(amount),
        asset: 'ATOStest',
        timestamp: Date.now(),
        from: accountAddress,
        to,
        status: 'completed',
        txHash: hash
      };
    } catch (error) {
      console.error('Transfer failed:', error);
      throw error;
    }
  };

  // Bridge deposit: L1 -> L2 cross-chain transfer
  const bridgeDeposit = async (amount: string): Promise<Transaction> => {
    ensureWalletConnected();

    try {
      // Check if user is on L1 chain
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l1ChainIdHex = '0x' + config.l1.chainId.toString(16);

      if (currentChainId !== l1ChainIdHex) {
        // Switch to L1 chain
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l1ChainIdHex }],
          });
        } catch (switchError: any) {
          // If chain doesn't exist, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l1ChainIdHex,
                chainName: config.l1.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l1.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      const amountWei = ethers.parseEther(amount);
      // Use window.ethereum to get the connected address (more reliable than walletClient)
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const destinationAddress = accounts[0];

      // Use the complete BRIDGE_ABI from JSON file
      // Create provider and signer for L1
      const l1Provider = new ethers.BrowserProvider(window.ethereum);
      const l1Signer = await l1Provider.getSigner();

      // Create bridge contract instance
      const bridgeContract = new ethers.Contract(
        config.contracts.l1Bridge,
        BRIDGE_ABI,
        l1Signer
      );

      // Call bridgeAsset
      console.log('[bridgeDeposit] Initiating bridge transaction...');
      const tx = await bridgeContract.bridgeAsset(
        1,                                          // destinationNetwork (L2)
        destinationAddress,                         // L2 receiving address
        amountWei,                                  // Amount in wei
        "0x0000000000000000000000000000000000000000", // Native ATOS (address(0))
        true,                                       // forceUpdateGlobalExitRoot
        "0x",                                       // No permit data
        { 
          value: amountWei,
          type: 0,                                  // ⭐ Force Legacy transaction (fork11 only accepts Type 0)
          gasPrice: 2_000_000_000                   // 2 gwei
        }                        // Send ATOS with transaction
      );

      console.log('[bridgeDeposit] Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('[bridgeDeposit] Transaction confirmed:', receipt.hash);

      // Start polling for bridge status
      pollBridgeStatus(destinationAddress, receipt.hash);

      return {
        id: receipt.hash,
        type: TransactionType.BRIDGE_DEPOSIT,
        amount: formatAmountWithSuffix(amount),
        asset: 'ATOStest',
        timestamp: Date.now(),
        from: destinationAddress,  // Use the address we already fetched
        to: destinationAddress,
        status: 'pending',
        txHash: receipt.hash
      };
    } catch (error) {
      console.error('Bridge deposit failed:', error);
      throw error;
    }
  };

  // Poll bridge service for deposit status
  const pollBridgeStatus = async (destAddr: string, l1TxHash: string) => {
    const maxAttempts = 60; // 10 minutes at 10s intervals
    let attempts = 0;

    const poll = async () => {
      try {
        const resp = await fetch(
          `${config.bridge.serviceUrl}/bridges/${destAddr}?limit=10`
        );
        const data = await resp.json();

        // Find the deposit by tx_hash
        const deposit = data.deposits?.find((d: any) => d.tx_hash === l1TxHash);

        if (deposit) {
          console.log('[Bridge Status]', {
            ready_for_claim: deposit.ready_for_claim,
            claim_tx_hash: deposit.claim_tx_hash,
          });

          // If claim_tx_hash exists, bridge is complete
          if (deposit.claim_tx_hash && deposit.claim_tx_hash !== '') {
            console.log('[Bridge Complete] Claim TX:', deposit.claim_tx_hash);
            // Bridge is complete - the transaction will be updated in App component
            return;
          }

          // If not ready yet, continue polling
          if (!deposit.ready_for_claim) {
            console.log('[Bridge Status] Waiting for L1->L2 sync...');
          } else {
            console.log('[Bridge Status] Ready for claim, waiting for auto-claim...');
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          console.warn('[Bridge Status] Polling timeout - please check manually');
        }
      } catch (error) {
        console.error('[Bridge Status] Polling error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        }
      }
    };

    // Start polling
    poll();
  };

  // ==================== L2 -> L1 Bridge Withdrawal ====================

  // Step 1: Call bridgeAsset on L2 to initiate withdrawal
  const bridgeWithdraw = async (amount: string): Promise<Transaction> => {
    ensureWalletConnected();

    try {
      // Check if user is on L2 chain and switch if needed
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l2ChainIdHex = '0x' + config.l2.chainId.toString(16);

      if (currentChainId !== l2ChainIdHex) {
        console.log('[bridgeWithdraw] Switching to L2 chain...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l2ChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l2ChainIdHex,
                chainName: config.l2.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l2.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      const amountWei = ethers.parseEther(amount);
      // Use window.ethereum to get the connected address (more reliable than walletClient)
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const destinationAddress = accounts[0];

      // Create provider and signer for L2
      const l2Provider = new ethers.BrowserProvider(window.ethereum);
      const l2Signer = await l2Provider.getSigner();

      // Create bridge contract instance on L2
      const bridgeContract = new ethers.Contract(
        config.contracts.l2Bridge,
        BRIDGE_ABI,
        l2Signer
      );

      // Call bridgeAsset with destinationNetwork = 0 (L1)
      console.log('[bridgeWithdraw] Initiating L2->L1 bridge transaction...');
      const tx = await bridgeContract.bridgeAsset(
        0,                                          // destinationNetwork (L1)
        destinationAddress,                         // L1 receiving address
        amountWei,                                  // Amount in wei
        "0x0000000000000000000000000000000000000000", // Native ATOS (address(0))
        true,                                       // forceUpdateGlobalExitRoot
        "0x",                                       // No permit data
        { 
          value: amountWei,
          type: 0,                                  // ⭐ Force Legacy transaction (fork11 only accepts Type 0)
          gasPrice: 2_000_000_000                   // 2 gwei
        }                        // Send ATOS with transaction
      );

      console.log('[bridgeWithdraw] Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('[bridgeWithdraw] Transaction confirmed on L2:', receipt.hash);

      // Start polling for bridge status (L2->L1 takes much longer)
      pollL2ToL1Status(destinationAddress, receipt.hash);

      return {
        id: receipt.hash,
        type: TransactionType.BRIDGE_WITHDRAW,
        amount: formatAmountWithSuffix(amount),
        asset: 'ATOStest',
        timestamp: Date.now(),
        from: destinationAddress,  // Use the address we already fetched
        to: destinationAddress,
        status: 'pending',
        txHash: receipt.hash
      };
    } catch (error) {
      console.error('Bridge withdrawal failed:', error);
      throw error;
    }
  };

  // Poll bridge service for L2->L1 withdrawal status
  const pollL2ToL1Status = async (destAddr: string, l2TxHash: string) => {
    const maxAttempts = 720; // 2 hours at 10s intervals (much longer than L1->L2)
    let attempts = 0;

    const poll = async () => {
      try {
        const resp = await fetch(
          `${config.bridge.serviceUrl}/bridges/${destAddr}?limit=50`
        );

        if (!resp.ok) {
          console.warn('[L2->L1 Bridge Status] Bridge service returned error:', resp.status, resp.statusText);
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000);
          }
          return;
        }

        const data = await resp.json();

        // Log all deposits for debugging (only first few attempts)
        if (attempts < 3) {
          console.log('[L2->L1 Bridge Debug] All deposits:', data.deposits?.map((d: any) => ({
            tx_hash: d.tx_hash,
            net_id: d.net_id,
            deposit_cnt: d.deposit_cnt,
            ready_for_claim: d.ready_for_claim
          })));
        }

        // Find the withdrawal by tx_hash (net_id should be 1 for L2->L1)
        const deposit = data.deposits?.find((d: any) =>
          d.tx_hash === l2TxHash && d.net_id === 1
        );

        if (deposit) {
          console.log('[L2->L1 Bridge Status]', {
            deposit_cnt: deposit.deposit_cnt,
            ready_for_claim: deposit.ready_for_claim,
            claim_tx_hash: deposit.claim_tx_hash,
            net_id: deposit.net_id,
          });

          // If claim_tx_hash exists, bridge is complete
          if (deposit.claim_tx_hash && deposit.claim_tx_hash !== '') {
            console.log('[L2->L1 Bridge Complete] Claim TX:', deposit.claim_tx_hash);
            // Bridge is complete
            return;
          }

          // If not ready yet, continue polling
          if (!deposit.ready_for_claim) {
            console.log('[L2->L1 Bridge Status] Waiting for ZK proof verification... (may take 1-2 hours)');

            // Show warning after 10 minutes
            if (attempts === 60) {
              console.warn('[L2->L1 Bridge Status] Still waiting for proof. This is normal, aggregator may be slow.');
            }
          } else {
            console.log('[L2->L1 Bridge Status] Ready for claim! You can now claim on L1.');
            // Auto-claim or notify user to claim
            if (deposit.deposit_cnt !== undefined) {
              await autoClaimL2ToL1(destAddr, deposit);
            }
          }
        } else {
          // Only show warning every 30 seconds to avoid spam
          if (attempts % 3 === 0) {
            console.warn(`[L2->L1 Bridge Status] Deposit not found yet (attempt ${attempts + 1}). Bridge service may need time to sync. TxHash: ${l2TxHash}`);
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          console.error('[L2->L1 Bridge Status] Polling timeout (2 hours) - please check manually');
          console.error('[L2->L1 Bridge Status] Check aggregator and prover status');
          console.error('[L2->L1 Bridge Status] Transaction hash:', l2TxHash);
        }
      } catch (error) {
        console.error('[L2->L1 Bridge Status] Polling error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        }
      }
    };

    // Start polling
    poll();
  };

  // Auto-claim L2->L1 withdrawal on L1
  const autoClaimL2ToL1 = async (destAddr: string, deposit: any) => {
    try {
      console.log('[Auto Claim] Starting claim process for deposit_cnt:', deposit.deposit_cnt);

      // Step 1: Get merkle proof from bridge service
      const proofResp = await fetch(
        `${config.bridge.serviceUrl}/merkle-proof?deposit_cnt=${deposit.deposit_cnt}&net_id=1`
      );

      if (!proofResp.ok) {
        throw new Error(`Failed to fetch merkle proof: ${proofResp.statusText}`);
      }

      const proofData = await proofResp.json();
      console.log('[Auto Claim] Merkle proof fetched:', proofData);

      // Step 2: Switch to L1 chain
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const l1ChainIdHex = '0x' + config.l1.chainId.toString(16);

      if (currentChainId !== l1ChainIdHex) {
        console.log('[Auto Claim] Switching to L1 chain...');
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l1ChainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: l1ChainIdHex,
                chainName: config.l1.name,
                nativeCurrency: config.l2.nativeCurrency,
                rpcUrls: [config.l1.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      // Step 3: Call claimAsset on L1
      const l1Provider = new ethers.BrowserProvider(window.ethereum);
      const l1Signer = await l1Provider.getSigner();
      const bridgeContract = new ethers.Contract(
        config.contracts.l1Bridge,
        BRIDGE_ABI,
        l1Signer
      );

      console.log('[Auto Claim] Calling claimAsset on L1...');
      const tx = await bridgeContract.claimAsset(
        proofData.proof.smt_proof,              // bytes32[32] smtProof
        proofData.proof.index,                   // uint32 index
        proofData.proof.main_exit_root,          // bytes32 mainnetExitRoot
        proofData.proof.rollup_exit_root,        // bytes32 rollupExitRoot
        deposit.origin_network,                  // uint32 originNetwork
        deposit.origin_token_address,            // address originTokenAddress
        deposit.dest_net,                        // uint32 destinationNetwork
        deposit.dest_addr,                       // address destinationAddress
        deposit.amount,                          // uint256 amount
        deposit.metadata                         // bytes metadata
      );

      console.log('[Auto Claim] Claim transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('[Auto Claim] Claim transaction confirmed:', receipt.hash);

      return receipt.hash;
    } catch (error: any) {
      console.error('[Auto Claim] Claim failed:', error);

      // Handle common errors
      if (error.message?.includes('GlobalExitRootInvalid')) {
        console.warn('[Auto Claim] GlobalExitRootInvalid - L2 GER not synced yet, will retry in 2 minutes');
        setTimeout(() => autoClaimL2ToL1(destAddr, deposit), 120000);
      } else if (error.message?.includes('AlreadyClaimed')) {
        console.log('[Auto Claim] Already claimed - skipping');
      } else if (error.message?.includes('InvalidSmtProof')) {
        console.warn('[Auto Claim] InvalidSmtProof - re-fetching proof and retrying');
        setTimeout(() => autoClaimL2ToL1(destAddr, deposit), 5000);
      } else if (error.message?.includes('InvalidNetwork')) {
        console.error('[Auto Claim] InvalidNetwork - check L2 bridge initialization');
      }

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
    bridgeDeposit,        // L1 -> L2 cross-chain bridge
    bridgeWithdraw,       // L2 -> L1 cross-chain bridge
    updatePrivateBalance,
    recoverNotesFromChain,    // Cross-device recovery: scan all Deposits from the chain and use viewingKey to decrypt Notes belonging to you
    localNotes,               // Local Note list (for UI rendering)
    refreshPrivateState,      // Manually refresh the UI after any Note change (already called automatically inside shield/transfer/unshield/recover)
  };
}
