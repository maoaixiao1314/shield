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
  computeNullifier,
  poseidonHash,
  buildZeros,
} from '@atoshi/privacy-sdk';

// 跟 useWallet.ts recoverNotesFromChain 一致的本地 Merkle 重建.
// SDK 自带的 rebuildMerkleTree 只扫 Deposit (Transfer 事件不带 leafIndex),
// 这里同时扫 Deposit + Transfer, 按时间顺序统一编 leafIndex.
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
  levels = 20,
  chunkSize = 9000
): Promise<LocalMerkleTreeData> {
  const latest = await provider.getBlockNumber();
  console.log(`[merkle] 开始扫链, 当前块高 ${latest}, 共 ${Math.ceil((latest+1)/chunkSize)} 个 chunk`);
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
  console.log(`[merkle] 扫链完毕, 共 ${entries.length} 个 leaf-inserting 事件`);

  // 按 (blockNumber, logIndex) 排序 — 跟合约 nextIndex 递增顺序一致
  entries.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex));
  const leaves = entries.map(e => e.commitment);

  console.log(`[merkle] 构建 zeros 表...`);
  const zerosStart = Date.now();
  const zeros = await buildZeros(levels);
  console.log(`[merkle]   zeros 表完成 ${Date.now() - zerosStart}ms`);

  // 自下而上 build tree, 每层 hash 相邻对
  console.log(`[merkle] 构建 ${levels} 层 tree...`);
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
  console.log(`[merkle]   tree 构建完成 ${Date.now() - treeStart}ms (${leaves.length} leaves, ${levels} levels)`);
  const root = treeLevels[levels][0] ?? zeros[levels - 1];

  function pathFor(leafIndex: number) {
    if (leafIndex < 0 || leafIndex >= leaves.length) {
      throw new Error(`leafIndex ${leafIndex} 超出范围 [0, ${leaves.length})`);
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

// transfer.circom 信号名跟 unshield.circom 不一样 (用 in*/out* 前缀)
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
  const tree = await rebuildMerkleTreeFull(args.provider, args.shieldAddress);

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
  const tree = await rebuildMerkleTreeFull(args.provider, args.shieldAddress);

  onProgress?.('计算 nullifier...');
  const nullifier = await computeNullifier(args.oldNote.commitment, args.spendingKey, args.oldNote.leafIndex);

  onProgress?.('构造 path...');
  const path = tree.pathFor(args.oldNote.leafIndex);

  // 注意: 当前电路是 1-input → 1-output transfer (没找零),
  // 所以 outAmount = inAmount, outTokenId = inTokenId (整张 Note 转出)
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
    outAmount: args.oldNote.amount.toString(),      // 跟 inAmount 一样
    outTokenId: args.oldNote.tokenId.toString(),    // 跟 inTokenId 一样
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
