/**
 * 钱包 Hook - 封装 SDK 调用
 */

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWalletClient, useSignTypedData, useSendTransaction, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { getPrivacySDK } from '../sdk/privacy-sdk';
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
      // 1. 生成 Note 和 Commitment
      const amountWei = ethers.parseEther(amount);
      const note = generateNote(amountWei, wallet.privacyKeys.publicAddress);
      const commitment = computeCommitment(note);

      // 2. 调用 Shield 合约的 deposit 函数
      const hash = await writeContractAsync({
        chain: atoshiL2,
        account: walletClient.account.address as `0x${string}`,
        address: config.contracts.shield as `0x${string}`,
        abi: [
          {
            name: 'deposit',
            type: 'function',
            stateMutability: 'payable',
            inputs: [{ name: 'commitment', type: 'bytes32' }],
            outputs: []
          }
        ] as const,
        functionName: 'deposit',
        args: [commitment as `0x${string}`],
        value: parseEther(amount),
        gas: 500000n,
        gasPrice: 1000000000000n // 1000 Gwei (提高 10 倍)
      });

      // 3. 保存 Note 到本地
      saveNote(note);

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

  // 辅助函数：生成 Note
  const generateNote = (amount: bigint, recipient: string) => {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const nullifier = ethers.hexlify(ethers.randomBytes(32));
    
    return {
      amount: amount,
      secret: secret,
      nullifier: nullifier,
      recipient: recipient,
      spent: false,
      leafIndex: -1
    };
  };

  // 辅助函数：计算 Commitment
  const computeCommitment = (note: any): string => {
    // 简化版 Poseidon Hash（实际应该使用 circomlibjs）
    const amountStr = note.amount.toString();
    const combined = amountStr + note.secret + note.nullifier + note.recipient;
    return ethers.keccak256(ethers.toUtf8Bytes(combined));
  };

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
    updatePrivateBalance
  };
}
