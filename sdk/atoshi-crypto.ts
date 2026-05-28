/**
 * Atoshi 隐私核心加密原语 (与 @atoshi/privacy-sdk 兼容).
 *
 * 1. EIP-712 派生 spendingKey/viewingKey/encryptionKey
 * 2. 真实 Poseidon (circomlibjs) → commitment / nullifier / owner pubkey
 * 3. ECIES (X25519 + AES-GCM) → encryptedNote 加密给自己/接收方
 * 4. 链上扫描 → 自动恢复 Note (跨设备)
 *
 * 跟 atoshi-privacy-sdk 用同样的算法,跨实现兼容.
 */

import { buildPoseidon } from 'circomlibjs';
import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { ethers } from 'ethers';

// ============================================================================
// 常量
// ============================================================================

export const BN254_FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

/** EIP-712 typed-data 用来派生隐私 key. 必须跟 SDK 一字不差 */
export const SEED_DERIVATION_TYPED_DATA = {
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

// ============================================================================
// 1. 密钥派生 (EIP-712 → masterSeed → 3 个 key)
// ============================================================================

export interface DerivedKeys {
  spendingKey: bigint;       // 算 nullifier 用,绝不泄漏
  viewingKey: bigint;        // 解密 EncryptedNote 用 (可分享给会计)
  encryptionKey: Uint8Array; // 32 字节,本地 AES-GCM 备份用 (兜底)
}

/**
 * 让用户签 EIP-712, 派生隐私 keys.
 * 同一个 EOA 签同一段 typed-data → 始终得到同样的 keys.
 */
export async function deriveKeysFromSigner(
  signer: ethers.Signer
): Promise<DerivedKeys> {
  const signature = await signer.signTypedData(
    SEED_DERIVATION_TYPED_DATA.domain,
    SEED_DERIVATION_TYPED_DATA.types,
    SEED_DERIVATION_TYPED_DATA.message
  );
  return deriveKeysFromSignature(signature);
}

export async function deriveKeysFromSignature(
  signatureHex: string
): Promise<DerivedKeys> {
  const sigBytes = ethers.getBytes(signatureHex);
  if (sigBytes.length !== 65) {
    throw new Error(`signature must be 65 bytes, got ${sigBytes.length}`);
  }
  // masterSeed = keccak256(signature)
  const seed = ethers.getBytes(ethers.keccak256(sigBytes));

  // HKDF-SHA256 派生 3 个 key, info 字符串跟 SDK 严格一致
  const spendingBytes = hkdf(sha256, seed, undefined, 'atoshi-privacy-v1:spending', 32);
  const viewingBytes = hkdf(sha256, seed, undefined, 'atoshi-privacy-v1:viewing', 32);
  const encryptionKey = hkdf(sha256, seed, undefined, 'atoshi-privacy-v1:encryption', 32);

  // spending/viewing 取模到 BN254 域 (Poseidon 要求)
  const spendingKey = bytesToFieldElement(spendingBytes);
  const viewingKey = bytesToFieldElement(viewingBytes);

  return { spendingKey, viewingKey, encryptionKey };
}

function bytesToFieldElement(bytes: Uint8Array): bigint {
  const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return BigInt(hex) % BN254_FIELD_SIZE;
}

// ============================================================================
// 2. Poseidon (真实 circomlibjs)
// ============================================================================

let _poseidon: any = null;
let _F: any = null;

async function getPoseidon() {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
    _F = _poseidon.F;
  }
  return { poseidon: _poseidon, F: _F };
}

/** Poseidon hash, 输入/输出都是 BN254 field element (bigint) */
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await getPoseidon();
  return F.toObject(poseidon(inputs));
}

/** 算 owner pubkey = Poseidon(spendingKey) */
export async function deriveOwnerPubkey(spendingKey: bigint): Promise<bigint> {
  return poseidon([spendingKey]);
}

/** 算 commitment = Poseidon(amount, tokenId, owner, blinding) */
export async function computeCommitment(
  amount: bigint,
  tokenId: bigint,
  owner: bigint,
  blinding: bigint
): Promise<bigint> {
  return poseidon([amount, tokenId, owner, blinding]);
}

/** 算 nullifier = Poseidon(commitment, spendingKey, leafIndex) */
export async function computeNullifier(
  commitment: bigint,
  spendingKey: bigint,
  leafIndex: bigint | number
): Promise<bigint> {
  return poseidon([commitment, spendingKey, BigInt(leafIndex)]);
}

/** 生成 31 字节随机 blinding (确保小于 BN254 域) */
export function randomBlinding(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  let hex = '0x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt(hex);
}

// ============================================================================
// 3. ECIES (X25519 + AES-GCM)
// ============================================================================

function viewingKeyToBytes(viewingKey: bigint): Uint8Array {
  const hex = viewingKey.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** viewingKey → X25519 公钥 (32 字节). 分享给别人加密给你 */
export function viewingPubKey(viewingKey: bigint): Uint8Array {
  return x25519.getPublicKey(viewingKeyToBytes(viewingKey));
}

/** 用接收方 viewingPubKey 加密 plaintext, 输出可放链上的 bytes */
export async function eciesEncrypt(
  plaintext: Uint8Array,
  recipientPubKey: Uint8Array
): Promise<Uint8Array> {
  if (recipientPubKey.length !== 32) throw new Error('pub key must be 32 bytes');

  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipientPubKey);

  const kdfInput = new Uint8Array(shared.length + ephPub.length);
  kdfInput.set(shared, 0);
  kdfInput.set(ephPub, shared.length);
  const aesKey = sha256(kdfInput);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ctTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  const out = new Uint8Array(32 + 12 + ctTag.length);
  out.set(ephPub, 0);
  out.set(iv, 32);
  out.set(ctTag, 44);
  return out;
}

/** 用 viewingKey 试解密. 不是给我的返回 null (不抛错) */
export async function eciesDecrypt(
  blob: Uint8Array,
  viewingKey: bigint
): Promise<Uint8Array | null> {
  if (blob.length < 60) return null;
  try {
    const ephPub = blob.subarray(0, 32);
    const iv = blob.subarray(32, 44);
    const ctTag = blob.subarray(44);

    const priv = viewingKeyToBytes(viewingKey);
    const shared = x25519.getSharedSecret(priv, ephPub);

    const kdfInput = new Uint8Array(shared.length + ephPub.length);
    kdfInput.set(shared, 0);
    kdfInput.set(ephPub, shared.length);
    const aesKey = sha256(kdfInput);

    const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ctTag));
  } catch {
    return null;
  }
}

/** Note 明文结构 (放进 encryptedNote 里) */
export interface NotePlaintext {
  amount: string;     // 十进制 BigInt 字符串
  tokenId: string;    // 同上
  blinding: string;   // 同上
}

export async function encryptNote(
  plaintext: NotePlaintext,
  recipientViewingPubKey: Uint8Array
): Promise<Uint8Array> {
  const json = JSON.stringify(plaintext);
  return eciesEncrypt(new TextEncoder().encode(json), recipientViewingPubKey);
}

export async function decryptNote(
  blob: Uint8Array,
  viewingKey: bigint
): Promise<NotePlaintext | null> {
  const pt = await eciesDecrypt(blob, viewingKey);
  if (!pt) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(pt));
    if (typeof obj?.amount === 'string' && typeof obj?.tokenId === 'string' && typeof obj?.blinding === 'string') {
      return obj as NotePlaintext;
    }
    return null;
  } catch {
    return null;
  }
}

/** 0x-prefixed hex → Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Uint8Array → 0x-prefixed hex */
export function bytesToHex(bytes: Uint8Array): string {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// ============================================================================
// 4. 链上扫描 (跨设备恢复 Note)
// ============================================================================

const DEPOSIT_EVENT_SIG = ethers.id(
  'Deposit(uint256,uint256,uint256,address,uint256,bytes)'
);

export interface RecoveredNote {
  commitment: bigint;
  leafIndex: number;
  blockNumber: number;
  txHash: string;
  amount: bigint;
  tokenId: bigint;
  blinding: bigint;
  source: 'deposit' | 'transfer';
}

const DEPOSIT_IFACE = new ethers.Interface([
  'event Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp, address indexed token, uint256 amount, bytes encryptedNote)',
]);

/**
 * 扫 Shield 合约所有 Deposit 事件, 挨个用 viewingKey 试解密 encryptedNote.
 * 解密成功的就是属于这个 viewingKey 的 Note. 用于跨设备恢复.
 *
 * @param provider     ethers provider
 * @param shieldAddr   Shield 合约地址
 * @param viewingKey   本地 viewingKey
 * @param fromBlock    起始块 (首次=0, 后续=上次 lastScanned+1)
 * @param onProgress   可选回调: 报告扫描进度
 */
export async function scanForMyNotes(
  provider: ethers.JsonRpcProvider,
  shieldAddr: string,
  viewingKey: bigint,
  fromBlock = 0,
  onProgress?: (scanned: number, total: number) => void
): Promise<RecoveredNote[]> {
  const latest = await provider.getBlockNumber();
  const CHUNK = 9000;
  const recovered: RecoveredNote[] = [];

  for (let from = fromBlock; from <= latest; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, latest);
    const logs = await provider.getLogs({
      address: shieldAddr,
      topics: [DEPOSIT_EVENT_SIG],
      fromBlock: from,
      toBlock: to,
    });

    for (const log of logs) {
      let parsed;
      try {
        parsed = DEPOSIT_IFACE.parseLog({ topics: log.topics as string[], data: log.data });
      } catch {
        continue;
      }
      if (!parsed) continue;

      const encryptedNoteHex = parsed.args.encryptedNote as string;
      if (!encryptedNoteHex || encryptedNoteHex === '0x') continue;

      const plaintext = await decryptNote(hexToBytes(encryptedNoteHex), viewingKey);
      if (!plaintext) continue;

      recovered.push({
        commitment: BigInt(parsed.args.commitment),
        leafIndex: Number(parsed.args.leafIndex),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        amount: BigInt(plaintext.amount),
        tokenId: BigInt(plaintext.tokenId),
        blinding: BigInt(plaintext.blinding),
        source: 'deposit',
      });
    }

    onProgress?.(to - fromBlock + 1, latest - fromBlock + 1);
  }

  return recovered;
}
