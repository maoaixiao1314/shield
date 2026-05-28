/**
 * Browser ZK proof generation for Unshield / Transfer.
 *
 * 使用 snarkjs.groth16.fullProve, 在浏览器里加载 .wasm + .zkey 文件,
 * 输出 snarkjs 格式的 proof + publicSignals.
 *
 * ⚠️ ZK proof 生成在低端机要 15-30 秒, UI 必须显示 loading + 进度.
 *    V1 直接在主线程跑, V2 可以封到 Web Worker.
 */

import { ethers } from 'ethers';
import * as snarkjs from 'snarkjs';
import {
  rebuildMerkleTree,
  computeNullifier,
  MerkleTreeData,
} from '@atoshi/privacy-sdk';

const UNSHIELD_WASM = '/circuits/unshield.wasm';
const UNSHIELD_ZKEY = '/circuits/unshield_final.zkey';
const TRANSFER_WASM = '/circuits/transfer.wasm';
const TRANSFER_ZKEY = '/circuits/transfer_final.zkey';

/** Solidity calldata-ready proof (G2 内层 swap 已处理) */
export interface SolidityProof {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
}

export interface UnshieldWitness {
  // public
  root: string;
  nullifierHash: string;
  recipient: string;
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

export interface TransferWitness {
  // public
  root: string;
  nullifierHash: string;
  newCommitment: string;
  // private
  privateKey: string;
  amount: string;
  tokenId: string;
  blinding: string;
  leafIndex: string;
  pathElements: string[];
  pathIndices: number[];
  newOwner: string;
  newBlinding: string;
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
  onProgress?.('生成 ZK proof (10-30 秒)...');
  const { proof } = await snarkjs.groth16.fullProve(
    witness as any,
    UNSHIELD_WASM,
    UNSHIELD_ZKEY
  );
  onProgress?.('proof 生成完毕');
  return formatSnarkjsProof(proof);
}

export async function proveTransfer(
  witness: TransferWitness,
  onProgress?: (stage: string) => void
): Promise<SolidityProof> {
  onProgress?.('生成 ZK proof (10-30 秒)...');
  const { proof } = await snarkjs.groth16.fullProve(
    witness as any,
    TRANSFER_WASM,
    TRANSFER_ZKEY
  );
  onProgress?.('proof 生成完毕');
  return formatSnarkjsProof(proof);
}

/**
 * 高层 Unshield: 链上重建 Merkle → 算 nullifier+path → 出 proof.
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
  fee?: bigint;
}, onProgress?: (stage: string) => void): Promise<{
  proof: SolidityProof;
  root: string;
  nullifierHash: string;
}> {
  onProgress?.('扫链重建 Merkle tree...');
  const tree: MerkleTreeData = await rebuildMerkleTree(args.provider, args.shieldAddress);

  onProgress?.('计算 nullifier...');
  const nullifier = await computeNullifier(args.note.commitment, args.spendingKey, args.note.leafIndex);

  onProgress?.('构造 path...');
  const path = tree.pathFor(args.note.leafIndex);

  const witness: UnshieldWitness = {
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
    recipient: BigInt(args.recipientAddress).toString(),
    tokenId: args.note.tokenId.toString(),
    amount: args.note.amount.toString(),
    fee: (args.fee ?? 0n).toString(),
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
 * 高层 Transfer: 同上,但生成新 commitment + transfer proof.
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
  newOwnerPubkey: bigint;   // Bob 的 ownerPubkey = Poseidon(Bob.spendingKey)
  newCommitment: bigint;    // 调用方算好的新 commitment
  newBlinding: bigint;
}, onProgress?: (stage: string) => void): Promise<{
  proof: SolidityProof;
  root: string;
  nullifierHash: string;
  newCommitment: string;
}> {
  onProgress?.('扫链重建 Merkle tree...');
  const tree: MerkleTreeData = await rebuildMerkleTree(args.provider, args.shieldAddress);

  onProgress?.('计算 nullifier...');
  const nullifier = await computeNullifier(args.oldNote.commitment, args.spendingKey, args.oldNote.leafIndex);

  onProgress?.('构造 path...');
  const path = tree.pathFor(args.oldNote.leafIndex);

  const witness: TransferWitness = {
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
    newCommitment: args.newCommitment.toString(),
    privateKey: args.spendingKey.toString(),
    amount: args.oldNote.amount.toString(),
    tokenId: args.oldNote.tokenId.toString(),
    blinding: args.oldNote.blinding.toString(),
    leafIndex: args.oldNote.leafIndex.toString(),
    pathElements: path.pathElements,
    pathIndices: path.pathIndices,
    newOwner: args.newOwnerPubkey.toString(),
    newBlinding: args.newBlinding.toString(),
  };

  const proof = await proveTransfer(witness, onProgress);
  return {
    proof,
    root: path.root.toString(),
    nullifierHash: nullifier.toString(),
    newCommitment: args.newCommitment.toString(),
  };
}
