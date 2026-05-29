/**
 * 钱包 Hook - 封装 SDK 调用
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

// 跟 @atoshi/privacy-sdk 严格一致的 EIP-712 typed-data (固定, 不带 timestamp)
// 这样同一个 EOA 签出来的 signature 永远一样, 派生的 keys 跨设备/会话一致.
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

// signature → seed (与 SDK 一致)
function _seedFromSignature(signatureHex: string): Uint8Array {
  const sigBytes = ethers.getBytes(signatureHex);
  if (sigBytes.length !== 65) throw new Error('signature must be 65 bytes');
  return ethers.getBytes(ethers.keccak256(sigBytes));
}

// HKDF-SHA256 派生 3 个 key, info 跟 SDK 字串严格一致
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

// 本地辅助:Uint8Array → 0x hex (SDK 不导出这个,自己写一行)
const bytesToHex = (b: Uint8Array): string => {
  let s = '0x';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
};
import { WalletState, Transaction, TransactionType, PrivacyKeys } from '../types';
import config from '../config';
import { atoshiL2 } from '../wagmi.config';

// 创建一个模拟的 Signer，使用 Wagmi 的 signTypedData
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

  // 当 walletClient 变化时，更新 provider 和 signer
  useEffect(() => {
    const initProvider = async () => {
      if (walletClient && window.ethereum) {
        console.log('初始化 provider 和 signer...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        console.log('Signer 初始化成功:', await signer.getAddress());
        setProvider(provider);
        setSigner(signer);
        
        // 尝试加载已保存的隐私密钥
        const savedKeys = localStorage.getItem('privacy_keys');
        if (savedKeys) {
          const keys = JSON.parse(savedKeys);
          setWallet(prev => ({ ...prev, privacyKeys: keys }));
          // 同时设置到 SDK 中
          sdk.setPrivacyKeys(keys);
          console.log('已将保存的密钥设置到 SDK');
        }
      }
    };
    
    initProvider();
  }, [walletClient, sdk]);

  // 初始化隐私密钥
  const initializePrivacy = async (): Promise<PrivacyKeys> => {
    console.log('initializePrivacy 被调用');
    
    if (!walletClient) {
      throw new Error('请先连接钱包,并切换到 Atoshi L2 链 (chain 67890)');
    }

    try {
      // ============================================================
      // ⭐ 关键: 用 @atoshi/privacy-sdk 的固定 EIP-712 typed-data 签名
      //   (旧 SDK 的 deriveKeys 用 timestamp 派生, 每次签名 keys 都不同 → 资金锁死)
      //   现在用 SDK 标准方法: 固定 typed-data + HKDF, 同一 EOA 始终得到同样 keys.
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

      // 转成 shield 项目 UI 用的 PrivacyKeys 格式 (兼容旧字段名)
      const spendingKey = derivedKeys.spendingKey.toString();
      const viewingKey = derivedKeys.viewingKey.toString();
      const ownerPubkey = await deriveOwnerPubkey(derivedKeys.spendingKey);

      const keys = {
        spendingKey,
        viewingKey,
        publicAddress: '0x' + ownerPubkey.toString(16).padStart(40, '0').slice(0, 40),  // 截 40 字符显示用
        isInitialized: true,
      };

      // 生成"我的隐私收款码"
      try {
        const viewPub = viewingPubKey(derivedKeys.viewingKey);
        (keys as any).receivingCode = JSON.stringify({
          ownerPubkey: ownerPubkey.toString(),
          viewingPubKey: bytesToHex(viewPub),
        });
        console.log('[receivingCode]', (keys as any).receivingCode);
      } catch (e) {
        console.warn('生成 receivingCode 失败:', e);
      }

      // 保存到本地
      localStorage.setItem('privacy_keys', JSON.stringify(keys));
      setWallet(prev => ({ ...prev, privacyKeys: keys }));
      sdk.setPrivacyKeys(keys);
      console.log('[initializePrivacy] keys derived (固定 EIP-712, 跨设备/会话一致)');
      return keys;
    } catch (error) {
      console.error('初始化隐私密钥失败:', error);
      throw error;
    }
  };

  // 更新隐私余额
  const updatePrivateBalance = async () => {
    try {
      const balance = await sdk.getPrivateBalance();
      setWallet(prev => ({
        ...prev,
        privateBalance: `${ethers.formatEther(balance)} ATOSHI`
      }));
    } catch (error) {
      console.error('更新隐私余额失败:', error);
    }
  };

  // Shield（存款）
  const shield = async (amount: string): Promise<Transaction> => {
    if (!walletClient) {
      throw new Error('请先连接钱包,并切换到 Atoshi L2 链 (chain 67890)');
    }

    try {
      // 1. 用真实 Poseidon + ECIES 构造 Note + 加密
      //    需要 spendingKey / viewingKey: 从 wallet.privacyKeys 里恢复
      const spendingKey = BigInt(wallet.privacyKeys.spendingKey);
      const viewingKey = BigInt(wallet.privacyKeys.viewingKey);

      const amountWei = ethers.parseEther(amount);
      const tokenId = 0n; // NATIVE_TOKEN
      const blinding = randomBlinding();

      // commitment = Poseidon(amount, tokenId, ownerPubkey, blinding)
      const ownerPubkey = await deriveOwnerPubkey(spendingKey);
      const commitment = await atoshiComputeCommitment(amountWei, tokenId, ownerPubkey, blinding);

      // 加密 Note 给自己 (跨设备恢复时用 viewingKey 扫回来)
      const encryptedNote = await encryptNote(
        {
          amount: amountWei.toString(),
          tokenId: tokenId.toString(),
          blinding: blinding.toString(),
        },
        viewingPubKey(viewingKey)
      );

      // 2. 调 Shield.deposit
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

      // 3. 等 tx 上链 + 从 Deposit 事件解出 leafIndex
      //    Shield deposit 后必须知道 leafIndex 才能 Unshield / Transfer (算 nullifier 用)
      //    之前存 -1 占位等用户手动恢复, 太坑. 现在自动同步.
      const receiptProvider = new ethers.JsonRpcProvider(
        config.l2.rpcUrl,
        { chainId: config.l2.chainId, name: 'atoshi-l2' },
        { batchMaxCount: 1, staticNetwork: true }
      );
      let leafIndex = -1;
      try {
        // 轮询 receipt (fork11 RPC 不一定立刻返回)
        let receipt = null;
        const deadline = Date.now() + 60_000;
        while (!receipt && Date.now() < deadline) {
          receipt = await receiptProvider.getTransactionReceipt(hash);
          if (!receipt) await new Promise(r => setTimeout(r, 1500));
        }
        if (receipt) {
          // 找 Deposit 事件 (commitment 作 indexed topic 用来匹配)
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
        console.warn('[shield] 解析 leafIndex 失败,只能存 -1, 用户需要手动 Recover Note:', e);
      }

      // 4. 保存 Note 到本地
      saveNote({
        amount: amountWei,
        secret: blinding.toString(),  // 沿用旧字段名兼容 UI, 实际存的是 blinding
        nullifier: '',                // 花费时才算
        recipient: wallet.privacyKeys.publicAddress,
        spent: false,
        leafIndex,                    // ✓ 真实 leafIndex, 可以直接 Transfer/Unshield
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
      console.error('Shield 失败:', error);
      throw error;
    }
  };

  // 跨设备恢复: 从链上扫描 + 解密属于本人的 Note
  // 关键: 必须为 Transfer 收到的 Note 算出真实 leafIndex (合约 Transfer 事件不带 leafIndex 字段,
  // 但 Merkle tree 按 Deposit+Transfer 时间顺序递增. 所以扫完整 events 按顺序数即可).
  const recoverNotesFromChain = async (): Promise<RecoveredNote[]> => {
    if (!wallet.privacyKeys?.isInitialized) {
      throw new Error('请先连接钱包并签名以派生隐私身份');
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

    // 1. 拉所有 leaf-inserting 事件 (Deposit + Transfer), 按 [blockNumber, logIndex] 排序
    const latest = await provider.getBlockNumber();
    const CHUNK = 9000;
    type Entry = {
      blockNumber: number;
      logIndex: number;
      txHash: string;
      kind: 'deposit' | 'transfer';
      commitment: bigint;
      encryptedNote: string;
      depositLeafIndex?: number;  // Deposit 事件自带的 leafIndex
    };
    const entries: Entry[] = [];

    for (let from = 0; from <= latest; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, latest);
      // 拉这段所有 Shield 事件 (不过滤 topic[0])
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

    // 2. 按 (blockNumber, logIndex) 严格排序 — 这就是合约 Merkle tree 的插入顺序
    entries.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return a.logIndex - b.logIndex;
    });

    // 3. 给每个事件分配 leafIndex (从 0 递增). 同时 sanity check: Deposit 的 自带 leafIndex 必须匹配.
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.kind === 'deposit' && e.depositLeafIndex !== undefined && e.depositLeafIndex !== i) {
        console.warn(
          `[recovery] leafIndex sanity check: entry[${i}] Deposit 自带 leafIndex=${e.depositLeafIndex} 跟时间序号 ${i} 不一致! ` +
          `可能漏了事件 或排序错. 用 i=${i} 继续.`
        );
      }
    }

    // 4. 用 viewingKey 试解每个 encryptedNote
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
        leafIndex: i,            // ⭐ 用时间序号作 leafIndex (Deposit + Transfer 统一编号)
        blockNumber: e.blockNumber,
        txHash: e.txHash,
        source: e.kind,
        amount: BigInt(plaintext.amount),
        tokenId: BigInt(plaintext.tokenId),
        blinding: BigInt(plaintext.blinding),
      });
    }

    // 5. 合并到本地 (按 commitment 去重)
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
    console.log(`[recovery] 共 ${entries.length} leaf-inserting 事件, 恢复 ${recovered.length} 笔属于本人的 Note`);
    return recovered;
  };

  // 旧的 generateNote / computeCommitment (用 keccak 占位) 已删除:
  // - Note 构造用 sdk/atoshi-crypto.ts 的 randomBlinding + computeCommitment (真实 Poseidon)
  // - 直接在 shield() 流程里 inline (line 142-160)

  // 辅助函数：保存 Note
  const saveNote = (note: any): void => {
    const notes = loadNotes();
    // 将 BigInt 转换为字符串以便序列化
    const serializedNote = {
      ...note,
      amount: note.amount.toString()
    };
    notes.push(serializedNote);
    localStorage.setItem('privacy_notes', JSON.stringify(notes));
  };

  // 辅助函数：加载 Notes
  const loadNotes = (): any[] => {
    const stored = localStorage.getItem('privacy_notes');
    if (!stored) return [];
    
    try {
      const notes = JSON.parse(stored);
      // 保留所有字段, amount 转回 BigInt
      // (注意: secret/commitment 保持 decimal 字符串, 用的时候再 BigInt(...))
      return notes.map((note: any) => ({
        ...note,
        amount: BigInt(note.amount),
      }));
    } catch (error) {
      console.error('加载 Notes 失败:', error);
      return [];
    }
  };

  // Transfer (隐私 → 隐私) — 真实 ZK proof + Shield.transfer
  //
  // `to` 参数是 Bob 的"隐私收款码", 是一个 JSON 字符串(或 base64 编码), 包含:
  //   { ownerPubkey: "...", viewingPubKey: "0x..." }
  //
  // Bob 在自己设置 Setup Privacy 后, 钱包应展示一个二维码 / 复制按钮
  // 让 Bob 把这两个公开值分享给 Alice. Alice 扫码/粘贴后调本函数.
  //
  // 安全: ownerPubkey 和 viewingPubKey 都是公开值, 分享不会泄漏 Bob 的资金.
  const privateSend = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) throw new Error('请先连接钱包,并切换到 Atoshi L2 链 (chain 67890)');
    if (!wallet.privacyKeys?.isInitialized) throw new Error('请先初始化隐私身份');

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. 解析 Bob 的收款码
    let bobOwnerPubkey: bigint;
    let bobViewingPubKey: Uint8Array;
    try {
      const trimmed = to.trim();
      // 支持两种格式:
      //   A) JSON: {"ownerPubkey":"...","viewingPubKey":"0x..."}
      //   B) 简化纯 ownerPubkey (Bob 还没分享 viewingPubKey, fallback 加密给自己)
      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        if (!parsed.ownerPubkey || !parsed.viewingPubKey) {
          throw new Error('收款码缺字段');
        }
        bobOwnerPubkey = BigInt(parsed.ownerPubkey);
        const hex = parsed.viewingPubKey.startsWith('0x') ? parsed.viewingPubKey.slice(2) : parsed.viewingPubKey;
        bobViewingPubKey = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bobViewingPubKey.length; i++) {
          bobViewingPubKey[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        if (bobViewingPubKey.length !== 32) throw new Error('viewingPubKey 必须 32 字节');
      } else {
        // Fallback: 旧格式只有 ownerPubkey, 加密给自己(用户兜底, Bob 需要带外传 Note)
        bobOwnerPubkey = BigInt(trimmed);
        bobViewingPubKey = viewingPubKey(BigInt(wallet.privacyKeys.viewingKey));
        console.warn('[transfer] 收款码不带 viewingPubKey,加密给自己(Bob 收不到 Note 通知)');
      }
    } catch (e: any) {
      throw new Error(`无效的收款码: ${e?.message || e}`);
    }

    // 2. 选一笔金额相等的本地 Note
    const availableNotes = loadNotes().filter((n: any) => !n.spent);
    const matchingNotes = availableNotes.filter((n: any) => BigInt(n.amount) === amountWei);
    if (matchingNotes.length === 0) {
      if (availableNotes.length === 0) {
        throw new Error(
          `池子里没有任何 Note. 请先 Shield Funds (例: Shield ${amount} ATOSHI),\n` +
          `然后点 "🔄 从链上恢复 Note" 同步 leafIndex,\n` +
          `再回来转账.`
        );
      }
      // 列出现有 Note 金额清单
      const amountsList = availableNotes
        .map((n: any) => ethers.formatEther(n.amount))
        .join(', ');
      throw new Error(
        `池子里没有金额 = ${amount} ATOSHI 的 Note.\n\n` +
        `V1 不支持找零, 必须 Note 金额跟转账金额完全相等.\n\n` +
        `您当前可用 Note 金额: [${amountsList}] ATOSHI\n\n` +
        `解决: 先 Shield ${amount} ATOSHI 再来转账.`
      );
    }
    const oldNote = matchingNotes[0];
    if (oldNote.leafIndex < 0) throw new Error('Note 还没确认 leafIndex,请先点"🔄 从链上恢复 Note"');

    // 3. 构造新 Note (owner = Bob)
    const newBlinding = randomBlinding();
    const tokenId = 0n;
    const newCommitment = await atoshiComputeCommitment(amountWei, tokenId, bobOwnerPubkey, newBlinding);

    // 加密 newNote 给 Bob (用 Bob 的 viewingPubKey 加密, Bob 扫链能解开)
    // 如果用户没提供 Bob 的 viewingPubKey, 会 fallback 用 Alice 自己的(在上面解析时已设)
    const encryptedNote = await encryptNote(
      { amount: amountWei.toString(), tokenId: '0', blinding: newBlinding.toString() },
      bobViewingPubKey
    );

    // 4. 准备 provider + 生成 ZK proof
    const provider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );

    console.log('[transfer] 生成 ZK proof...');
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

    // 5. 调 Shield.transfer
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

    // 6. 标记旧 Note 已花费
    const notes = loadNotes();
    for (const n of notes) {
      if (n.commitment === oldNote.commitment) { n.spent = true; n.nullifier = nullifierHash; break; }
    }
    localStorage.setItem('privacy_notes', JSON.stringify(notes));

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

  // Unshield (隐私 → 明文) — 真实 ZK proof + Shield.withdraw
  const unshield = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) throw new Error('请先连接钱包,并切换到 Atoshi L2 链 (chain 67890)');
    if (!wallet.privacyKeys?.isInitialized) throw new Error('请先初始化隐私身份');

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. 找金额完全匹配的本地 Note (V1 不支持找零)
    const availableNotes = loadNotes().filter((n: any) => !n.spent);
    const matchingNotes = availableNotes.filter((n: any) => BigInt(n.amount) === amountWei);
    if (matchingNotes.length === 0) {
      if (availableNotes.length === 0) {
        throw new Error(
          `池子里没有任何 Note. 请先 Shield Funds ${amount} ATOSHI,\n` +
          `然后点 "🔄 从链上恢复 Note", 再回来取款.`
        );
      }
      const amountsList = availableNotes
        .map((n: any) => ethers.formatEther(n.amount))
        .join(', ');
      throw new Error(
        `池子里没有金额 = ${amount} ATOSHI 的 Note.\n\n` +
        `V1 不支持自动找零, 必须 Note 金额跟取款金额完全相等.\n\n` +
        `您当前可用 Note 金额: [${amountsList}] ATOSHI\n\n` +
        `解决: 改成取一张已有的 Note 完整金额, 或先 Shield ${amount} ATOSHI 再取.`
      );
    }
    const note = matchingNotes[0];
    if (note.leafIndex < 0) throw new Error('Note 还没确认 leafIndex (没扫到链上),请先点"🔄 从链上恢复 Note"按钮');

    // 2. 准备 provider (fork11 兼容)
    const provider = new ethers.JsonRpcProvider(
      config.l2.rpcUrl,
      { chainId: config.l2.chainId, name: 'atoshi-l2' },
      { batchMaxCount: 1, staticNetwork: true }
    );

    // 3. 重建 Merkle tree + 生成 ZK proof (耗时 10-30 秒)
    console.log('[unshield] 开始生成 ZK proof...');
    const { proof, root, nullifierHash } = await prepareAndProveUnshield({
      provider,
      shieldAddress: config.contracts.shield,
      spendingKey,
      note: {
        commitment: BigInt(note.commitment),
        amount: BigInt(note.amount),
        tokenId: 0n,
        blinding: BigInt(note.secret),  // secret 字段实际存的是 blinding
        leafIndex: note.leafIndex,
      },
      recipientAddress: to,
    }, (stage) => console.log('[unshield]', stage));

    // 4. 调 Shield.withdraw
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
        NATIVE_TOKEN,        // relayer: 自付模式
        0n,                  // fee: 自付
        NATIVE_TOKEN,
        amountWei,
      ],
      gas: 1_500_000n,
      gasPrice: 2_000_000_000n,
    });

    // 5. 本地标记 Note 已花费
    const notes = loadNotes();
    for (const n of notes) {
      if (n.commitment === note.commitment) { n.spent = true; n.nullifier = nullifierHash; break; }
    }
    localStorage.setItem('privacy_notes', JSON.stringify(notes));

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

  // 普通转账
  const transfer = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) {
      throw new Error('请先连接钱包,并切换到 Atoshi L2 链 (chain 67890)');
    }

    try {
      // 使用 Wagmi 的 sendTransaction
      const hash = await sendTransactionAsync({
        to: to as `0x${string}`,
        value: parseEther(amount),
        gas: 21000n,
        gasPrice: 100000000000n // 100 Gwei
      });

      // 等待交易确认
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
      console.error('转账失败:', error);
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
    recoverNotesFromChain,    // 跨设备恢复:从链扫所有 Deposit, 用 viewingKey 解密属于本人的 Note
  };
}
