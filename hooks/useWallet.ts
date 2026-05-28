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
  bytesToHex,
  scanForMyNotes,
  RecoveredNote,
} from '../sdk/atoshi-crypto';
import {
  prepareAndProveUnshield,
  prepareAndProveTransfer,
} from '../sdk/zk-prover';
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
      throw new Error('请先连接钱包');
    }

    try {
      // 使用 Wagmi 的 signTypedData 创建模拟 signer
      const wagmiSigner = new WagmiSigner(
        walletClient.account.address,
        signTypedDataAsync
      );
      
      const keys = await sdk.deriveKeys(wagmiSigner as any);
      
      // 保存到本地
      localStorage.setItem('privacy_keys', JSON.stringify(keys));
      
      // 设置到 wallet state
      setWallet(prev => ({ ...prev, privacyKeys: keys }));
      
      // SDK 内部已经设置了，但为了确保一致性，再次设置
      sdk.setPrivacyKeys(keys);
      
      console.log('隐私密钥初始化完成并已同步到 SDK');
      
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
      throw new Error('请先连接钱包');
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

      // 3. 保存 Note 到本地 (完整字段, 跟 ChainScanner 恢复的格式一致)
      saveNote({
        amount: amountWei,
        secret: blinding.toString(),  // 沿用旧字段名兼容 UI, 实际存的是 blinding
        nullifier: '',                // 花费时才算
        recipient: wallet.privacyKeys.publicAddress,
        spent: false,
        leafIndex: -1,                // tx 确认后从事件里读
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
    const lastScanned = parseInt(localStorage.getItem('last_scanned_block') || '0', 10);
    const recovered = await scanForMyNotes(
      provider,
      config.contracts.shield,
      viewingKey,
      lastScanned
    );
    // 合并到 localStorage (按 commitment 去重)
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
    localStorage.setItem('last_scanned_block', (await provider.getBlockNumber()).toString());
    console.log(`[recovery] 恢复 ${recovered.length} 笔 Note`);
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
      // 将字符串转换回 BigInt
      return notes.map((note: any) => ({
        amount: BigInt(note.amount),
        secret: note.secret,
        nullifier: note.nullifier,
        recipient: note.recipient,
        spent: note.spent,
        leafIndex: note.leafIndex
      }));
    } catch (error) {
      console.error('加载 Notes 失败:', error);
      return [];
    }
  };

  // Transfer (隐私 → 隐私) — 真实 ZK proof + Shield.transfer
  // `to` 参数是 **Bob 的 ownerPubkey** (Bob 从他的隐私身份导出, 16 进制 string 或 decimal)
  //  生产场景 Bob 会先把 ownerPubkey 给 Alice (扫码/IM), Alice 用它构造新 Note.
  const privateSend = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) throw new Error('请先连接钱包');
    if (!wallet.privacyKeys?.isInitialized) throw new Error('请先初始化隐私身份');

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);
    const viewingKey = BigInt(wallet.privacyKeys.viewingKey);

    // 1. 解析 Bob 的 ownerPubkey (输入可以是 0x... 或十进制)
    let bobOwnerPubkey: bigint;
    try {
      bobOwnerPubkey = to.startsWith('0x') ? BigInt(to) : BigInt(to);
    } catch {
      throw new Error(`无效的接收方 ownerPubkey: ${to}. 应是 BN254 域内的 BigInt`);
    }
    // 提示: V1.5 应该让 Bob 也分享 viewingPubKey, Alice 用它加密 newNote 给 Bob.
    // 当前 demo 简化: Alice 给自己 viewingPubKey 加密(自己也能恢复, Bob 需要带外传 Note).
    // TODO V1.5: 增加输入 Bob 的 viewingPubKey

    // 2. 选一笔金额相等的本地 Note
    const allNotes = loadNotes().filter((n: any) => !n.spent && BigInt(n.amount) === amountWei);
    if (allNotes.length === 0) throw new Error(`找不到金额等于 ${amount} ATOSHI 的可用 Note. V1 不支持找零.`);
    const oldNote = allNotes[0];
    if (oldNote.leafIndex < 0) throw new Error('Note 还没确认 leafIndex,请先点"恢复 Note"');

    // 3. 构造新 Note (owner = Bob)
    const newBlinding = randomBlinding();
    const tokenId = 0n;
    const newCommitment = await atoshiComputeCommitment(amountWei, tokenId, bobOwnerPubkey, newBlinding);

    // 加密 newNote 给自己 (兜底:Alice 自己能扫回; Bob 需 Alice 带外传完整 Note)
    const encryptedNote = await encryptNote(
      { amount: amountWei.toString(), tokenId: '0', blinding: newBlinding.toString() },
      viewingPubKey(viewingKey)
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
      gas: 800_000n,
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
    if (!walletClient) throw new Error('请先连接钱包');
    if (!wallet.privacyKeys?.isInitialized) throw new Error('请先初始化隐私身份');

    const amountWei = ethers.parseEther(amount);
    const spendingKey = BigInt(wallet.privacyKeys.spendingKey);

    // 1. 找一笔金额足够的本地 Note
    const allNotes = loadNotes().filter((n: any) => !n.spent && BigInt(n.amount) >= amountWei);
    if (allNotes.length === 0) throw new Error(`找不到金额 >= ${amount} ATOSHI 的可用 Note`);
    const note = allNotes[0];
    // V1 简化:只支持精确金额(找零留 V1.5). 如果 note 比 amount 大,提示用户.
    if (BigInt(note.amount) !== amountWei) {
      throw new Error(
        `当前 Note 金额 ${ethers.formatEther(note.amount)} ATOSHI 跟取款金额 ${amount} 不等. ` +
        `V1 不支持自动找零, 请用相同金额或先 Transfer 拆分.`
      );
    }
    if (note.leafIndex < 0) throw new Error('Note 还没确认 leafIndex (没扫到链上),请先点"恢复 Note"按钮');

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
      gas: 800_000n,
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
      throw new Error('请先连接钱包');
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
