/**
 * Browser ZK proof generation for Unshield / Transfer.
 *
 * Uses snarkjs.groth16.fullProve to load the .wasm + .zkey files in the browser,
 * and outputs a snarkjs-format proof + publicSignals.
 *
 * ⚠️ ZK proof generation takes 15-30 seconds on low-end machines, so the UI must show loading + progress.
 *    V1 runs directly on the main thread; V2 can wrap it in a Web Worker.
 */

import { ethers } from 'ethers';
import * as snarkjs from 'snarkjs';
import {
  computeNullifier,
  poseidonHash,
  buildZeros,
} from '@atoshi/privacy-sdk';

// Local Merkle rebuild, consistent with useWallet.ts recoverNotesFromChain.
// The SDK's built-in rebuildMerkleTree only scans Deposit (Transfer events don't carry a leafIndex),
// so here we scan both Deposit + Transfer and assign leafIndex uniformly in chronological order.
const DEPOSIT_SIG = '0x6a03f0fec6477e3a9b9a4dfa0c5d4946db6de9070374844e2dd9e06626775375';
const TRANSFER_SIG = '0x6b771087a455114922d19bd482d743c590e20ecd176b82b4e375c09584e0679b';
const DEPOSIT_IFACE = new ethers.Interface([
  'event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp, address indexed token, uint256 amount, bytes encryptedNote)',
]);
const TRANSFER_IFACE = new ethers.Interface([
  'event Transfer(uint256 indexed nullifierHash, uint256 indexed newCommitment, bytes encryptedNote)',
]);

interface LocalMerkleTreeData {
  leaves: bigint[];
  treeLevels: bigint[][];
  root: bigint;
  zeros: bigint[];
  pathFor(leafIndex: number): { pathElements: string[]; pathIndices: number[]; root: bigint };
}

async function rebuildMerkleTreeFull(
  provider: ethers.JsonRpcProvider,
  shieldAddress: string,
  // Must match Shield.sol's TREE_LEVELS. Bumped to 32 in audit Issue 7
  // to neutralize the cheap-DoS fill-the-tree attack.
  levels = 32,
  chunkSize = 9000
): Promise<LocalMerkleTreeData> {
  const latest = await provider.getBlockNumber();
  console.log(`[merkle] Starting chain scan, current block height ${latest}, ${Math.ceil((latest+1)/chunkSize)} chunk(s) total`);
  type Entry = { blockNumber: number; logIndex: number; commitment: bigint };
  const entries: Entry[] = [];

  let chunkIdx = 0;
  const totalChunks = Math.ceil((latest + 1) / chunkSize);
  for (let from = 0; from <= latest; from += chunkSize) {
    chunkIdx++;
    const to = Math.min(from + chunkSize - 1, latest);
    const chunkStart = Date.now();
    const logs = await provider.getLogs({
      address: shieldAddress,
      fromBlock: from,
      toBlock: to,
    });
    const dt = Date.now() - chunkStart;
    let chunkLeafs = 0;
    for (const log of logs) {
      try {
        if (log.topics[0] === DEPOSIT_SIG) {
          const parsed = DEPOSIT_IFACE.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed) {
            entries.push({
              blockNumber: log.blockNumber, logIndex: log.index,
              commitment: BigInt(parsed.args.commitment),
            });
            chunkLeafs++;
          }
        } else if (log.topics[0] === TRANSFER_SIG) {
          const parsed = TRANSFER_IFACE.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed) {
            entries.push({
              blockNumber: log.blockNumber, logIndex: log.index,
              commitment: BigInt(parsed.args.newCommitment),
            });
            chunkLeafs++;
          }
        }
      } catch {}
    }
    console.log(`[merkle]   chunk ${chunkIdx}/${totalChunks} (block ${from}-${to})  ${dt}ms  +${chunkLeafs} leafs (total ${entries.length})`);
  }
  console.log(`[merkle] Chain scan complete, ${entries.length} leaf-inserting event(s) total`);

  // Sort by (blockNumber, logIndex) — consistent with the contract's incrementing nextIndex order
  entries.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex));
  const leaves = entries.map(e => e.commitment);

  console.log(`[merkle] Building zeros table...`);
  const zerosStart = Date.now();
  const zeros = await buildZeros(levels);
  console.log(`[merkle]   zeros table complete ${Date.now() - zerosStart}ms`);

  // Build the tree bottom-up, hashing adjacent pairs at each level
  console.log(`[merkle] Building ${levels}-level tree...`);
  const treeStart = Date.now();
  const treeLevels: bigint[][] = [leaves.slice()];
  for (let lvl = 0; lvl < levels; lvl++) {
    const cur = treeLevels[lvl];
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i];
      const right = i + 1 < cur.length ? cur[i + 1] : zeros[lvl];
      next.push(await poseidonHash([left, right]));
    }
    treeLevels.push(next);
  }
  console.log(`[merkle]   tree build complete ${Date.now() - treeStart}ms (${leaves.length} leaves, ${levels} levels)`);
  const root = treeLevels[levels][0] ?? zeros[levels - 1];

  function pathFor(leafIndex: number) {
    if (leafIndex < 0 || leafIndex >= leaves.length) {
      throw new Error(`leafIndex ${leafIndex} out of range [0, ${leaves.length})`);
    }
    const pathElements: string[] = [];
    const pathIndices: number[] = [];
    let curIdx = leafIndex;
    for (let lvl = 0; lvl < levels; lvl++) {
      const isRight = curIdx & 1;
      const sibIdx = isRight ? curIdx - 1 : curIdx + 1;
      const level = treeLevels[lvl];
      const sibling = sibIdx < level.length ? level[sibIdx] : zeros[lvl];
      pathElements.push(sibling.toString());
      pathIndices.push(isRight);
      curIdx = curIdx >> 1;
    }
    return { pathElements, pathIndices, root };
  }

  return { leaves, treeLevels, root, zeros, pathFor };
}

const SHIELD_WASM = '/circuits/shield.wasm';
const SHIELD_ZKEY = '/circuits/shield_final.zkey';
const UNSHIELD_WASM = '/circuits/unshield.wasm';
const UNSHIELD_ZKEY = '/circuits/unshield_final.zkey';
const TRANSFER_WASM = '/circuits/transfer.wasm';
const TRANSFER_ZKEY = '/circuits/transfer_final.zkey';

/** Solidity calldata-ready proof (G2 inner swap already handled) */
export interface SolidityProof {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
}

/**
 * ShieldWitness — deposit circuit input.
 * Audit Issue 2 added (amount, tokenId) as public inputs so the contract
 * can verify the commitment was formed from the actual on-chain transfer.
 */
export interface ShieldWitness {
  // public
  commitment: string;
  amount: string;
  tokenId: string;
  // private
  owner: string;       // Poseidon(spendingKey)
  blinding: string;
}

export interface UnshieldWitness {
  // public
  root: string;
  nullifierHash: string;
  recipient: string;
  // Audit Issue 3 (circuit) / Issue 4 (contract): the relayer is now
  // bound into the Groth16 public-input vector so an attacker cannot
  // swap _relayer in calldata and steal the fee. Pass address(0) when
  // self-broadcasting (fee must be 0 in that case).
  relayer: string;
  tokenId: string;
  amount: string;
  fee: string;
  // private
  privateKey: string;
  blinding: string;
  leafIndex: string;
  pathElements: string[];
  pathIndices: number[];
}

// transfer.circom signal names differ from unshield.circom (using in*/out* prefixes)
// signal input root, nullifierHash, newCommitment;
// signal input inAmount, inTokenId, inPrivateKey, inBlinding, inLeafIndex;
// signal input pathElements[20], pathIndices[20];
// signal input outAmount, outTokenId, outOwner, outBlinding;
export interface TransferWitness {
  root: string;
  nullifierHash: string;
  newCommitment: string;
  inAmount: string;
  inTokenId: string;
  inPrivateKey: string;
  inBlinding: string;
  inLeafIndex: string;
  pathElements: string[];
  pathIndices: number[];
  outAmount: string;
  outTokenId: string;
  outOwner: string;
  outBlinding: string;
}

function formatSnarkjsProof(proof: any): SolidityProof {
  return {
    pA: [proof.pi_a[0], proof.pi_a[1]],
    pB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    pC: [proof.pi_c[0], proof.pi_c[1]],
  };
}

export async function proveUnshield(
  witness: UnshieldWitness,
  onProgress?: (stage: string) => void
): Promise<SolidityProof> {
  onProgress?.('Generating ZK proof (10-30 seconds)...');
  const { proof } = await snarkjs.groth16.fullProve(
    witness as any,
    UNSHIELD_WASM,
    UNSHIELD_ZKEY
  );
  onProgress?.('proof generation complete');
  return formatSnarkjsProof(proof);
}

/**
 * Deposit proof — required by Shield.deposit() after audit Issue 2.
 * Without it the contract reverts with "Shield: invalid deposit proof".
 * Much cheaper than unshield/transfer proofs (no Merkle path), so the
 * loading UI can usually finish in a couple of seconds on commodity
 * hardware.
 */
export async function proveShield(
  witness: ShieldWitness,
  onProgress?: (stage: string) => void
): Promise<SolidityProof> {
  onProgress?.('Generating deposit proof (1-5 seconds)...');
  const { proof } = await snarkjs.groth16.fullProve(
    witness as any,
    SHIELD_WASM,
    SHIELD_ZKEY
  );
  onProgress?.('deposit proof complete');
  return formatSnarkjsProof(proof);
}

/**
 * High-level Shield: compute commitment + prove correct formation in
 * one shot. Caller supplies the secret material; we don't touch the
 * SDK's randomBlinding so callers can keep their existing deterministic
 * test vectors.
 */
export async function prepareAndProveShield(args: {
  amount: bigint;
  tokenId: bigint;
  ownerPubkey: bigint;   // Poseidon(spendingKey) — already derived by caller
  blinding: bigint;
  commitment: bigint;    // already computed by caller (avoids re-Poseidon here)
}, onProgress?: (stage: string) => void): Promise<{ proof: SolidityProof }> {
  const witness: ShieldWitness = {
    commitment: args.commitment.toString(),
    amount: args.amount.toString(),
    tokenId: args.tokenId.toString(),
    owner: args.ownerPubkey.toString(),
    blinding: args.blinding.toString(),
  };
  const proof = await proveShield(witness, onProgress);
  return { proof };
}

export async function proveTransfer(
  witness: TransferWitness,
  onProgress?: (stage: string) => void
): Promise<SolidityProof> {
  onProgress?.('Generating ZK proof (10-30 seconds)...');
  const { proof } = await snarkjs.groth16.fullProve(
    witness as any,
    TRANSFER_WASM,
    TRANSFER_ZKEY
  );
  onProgress?.('proof generation complete');
  return formatSnarkjsProof(proof);
}

/**
 * High-level Unshield: rebuild Merkle from chain → compute nullifier + path → produce proof.
 */
export async function prepareAndProveUnshield(args: {
  provider: ethers.JsonRpcProvider;
  shieldAddress: string;
  spendingKey: bigint;
  note: {
    commitment: bigint;
    amount: bigint;
    tokenId: bigint;
    blinding: bigint;
    leafIndex: number;
  };
  recipientAddress: string;
  // Audit Issue 3/4: relayer is now bound into the proof. Pass the EOA
  // that will actually broadcast Shield.withdraw. Default to address(0)
  // for self-broadcast (in which case fee MUST be 0; the contract
  // enforces it).
  relayerAddress?: string;
  fee?: bigint;
}, onProgress?: (stage: string) => void): Promise<{
  proof: SolidityProof;
  root: string;
  nullifierHash: string;
}> {
  onProgress?.('Scanning chain to rebuild Merkle tree...');
  const tree = await rebuildMerkleTreeFull(args.provider, args.shieldAddress);

  onProgress?.('Computing nullifier...');
  const nullifier = await computeNullifier(args.note.commitment, args.spendingKey, args.note.leafIndex);

  onProgress?.('Constructing path...');
  const path = tree.pathFor(args.note.leafIndex);

  const relayerAddr = args.relayerAddress ?? '0x0000000000000000000000000000000000000000';
  const fee = args.fee ?? 0n;
  if (fee > 0n && BigInt(relayerAddr) === 0n) {
    throw new Error('A non-zero relayer address is required when fee > 0 (Shield contract enforces this).');
  }

  const witness: UnshieldWitness = {
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
    recipient: BigInt(args.recipientAddress).toString(),
    relayer: BigInt(relayerAddr).toString(),
    tokenId: args.note.tokenId.toString(),
    amount: args.note.amount.toString(),
    fee: fee.toString(),
    privateKey: args.spendingKey.toString(),
    blinding: args.note.blinding.toString(),
    leafIndex: args.note.leafIndex.toString(),
    pathElements: path.pathElements,
    pathIndices: path.pathIndices,
  };

  const proof = await proveUnshield(witness, onProgress);
  return {
    proof,
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
  };
}

/**
 * High-level Transfer: same as above, but generates a new commitment + transfer proof.
 */
export async function prepareAndProveTransfer(args: {
  provider: ethers.JsonRpcProvider;
  shieldAddress: string;
  spendingKey: bigint;
  oldNote: {
    commitment: bigint;
    amount: bigint;
    tokenId: bigint;
    blinding: bigint;
    leafIndex: number;
  };
  newOwnerPubkey: bigint;   // Bob's ownerPubkey = Poseidon(Bob.spendingKey)
  newCommitment: bigint;    // the new commitment computed by the caller
  newBlinding: bigint;
}, onProgress?: (stage: string) => void): Promise<{
  proof: SolidityProof;
  root: string;
  nullifierHash: string;
  newCommitment: string;
}> {
  onProgress?.('Scanning chain to rebuild Merkle tree...');
  const tree = await rebuildMerkleTreeFull(args.provider, args.shieldAddress);

  onProgress?.('Computing nullifier...');
  const nullifier = await computeNullifier(args.oldNote.commitment, args.spendingKey, args.oldNote.leafIndex);

  onProgress?.('Constructing path...');
  const path = tree.pathFor(args.oldNote.leafIndex);

  // Note: the current circuit is a 1-input → 1-output transfer (no change),
  // so outAmount = inAmount, outTokenId = inTokenId (the entire Note is transferred out)
  const witness: TransferWitness = {
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
    newCommitment: args.newCommitment.toString(),
    inAmount: args.oldNote.amount.toString(),
    inTokenId: args.oldNote.tokenId.toString(),
    inPrivateKey: args.spendingKey.toString(),
    inBlinding: args.oldNote.blinding.toString(),
    inLeafIndex: args.oldNote.leafIndex.toString(),
    pathElements: path.pathElements,
    pathIndices: path.pathIndices,
    outAmount: args.oldNote.amount.toString(),      // same as inAmount
    outTokenId: args.oldNote.tokenId.toString(),    // same as inTokenId
    outOwner: args.newOwnerPubkey.toString(),
    outBlinding: args.newBlinding.toString(),
  };

  const proof = await proveTransfer(witness, onProgress);
  return {
    proof,
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
    newCommitment: args.newCommitment.toString(),
  };
}
