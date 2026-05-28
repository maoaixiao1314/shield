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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  computeNullifier,         // 留给 Unshield (W2) 用
  deriveOwnerPubkey,
  randomBlinding,
  encryptNote,
  viewingPubKey,
  bytesToHex,
  scanForMyNotes,
  RecoveredNote,
} from '../sdk/atoshi-crypto';
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

  // 隐私转账
  const privateSend = async (amount: string, to: string): Promise<Transaction> => {
    if (config.demoMode) {
      // 演示模式：返回模拟交易
      return {
        id: `demo_${Date.now()}`,
        type: TransactionType.PRIVATE_SEND,
        amount: `${amount} ATOSHI`,
        asset: 'ATOSHI',
        timestamp: Date.now(),
        from: wallet.privacyKeys.publicAddress,
        to,
        status: 'completed',
        nullifier: `nf_0x${Math.random().toString(16).substr(2, 32)}`
      };
    }

    const amountWei = ethers.parseEther(amount);
    return await sdk.privateSend(amountWei, to);
  };

  // Unshield（提款）
  const unshield = async (amount: string, to: string): Promise<Transaction> => {
    if (!walletClient) {
      throw new Error('请先连接钱包');
    }

    // 如果 signer 不存在，重新获取
    let currentSigner = signer;
    if (!currentSigner && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      currentSigner = await provider.getSigner();
      setSigner(currentSigner);
    }

    if (!currentSigner) {
      throw new Error('无法获取 signer');
    }

    if (config.demoMode) {
      // 演示模式：返回模拟交易
      return {
        id: `demo_${Date.now()}`,
        type: TransactionType.UNSHIELD,
        amount: `${amount} ATOSHI`,
        asset: 'ATOSHI',
        timestamp: Date.now(),
        from: wallet.privacyKeys.publicAddress,
        to,
        status: 'completed',
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        nullifier: `nf_0x${Math.random().toString(16).substr(2, 32)}`
      };
    }

    const amountWei = ethers.parseEther(amount);
    return await sdk.unshield(currentSigner, amountWei, to);
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
