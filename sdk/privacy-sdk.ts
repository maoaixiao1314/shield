/**
 * Atoshi Privacy SDK
 * 
 * 提供完整的隐私交易功能：
 * - 密钥派生（基于 EIP-712 签名）
 * - Shield（存款）
 * - 隐私转账
 * - Unshield（提款）
 * - Note 扫描和余额查询
 */

import { ethers } from 'ethers';
import { PrivacyKeys, Note, Transaction, TransactionType } from '../types';

// Poseidon Hash 模拟（实际应该使用 circomlibjs）
// TODO: 替换为真实的 Poseidon Hash
function poseidonHash(...inputs: string[]): string {
  const combined = inputs.join('');
  return ethers.keccak256(ethers.toUtf8Bytes(combined));
}

export class PrivacySDK {
  private provider: ethers.JsonRpcProvider;
  private shieldContract: ethers.Contract | null = null;
  private privacyKeys: PrivacyKeys | null = null;

  constructor(rpcUrl: string, shieldAddress?: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    if (shieldAddress) {
      // Shield 合约 ABI（简化版）
      const shieldABI = [
        'function deposit(bytes32 commitment) external payable',
        'function withdraw(bytes proof, bytes32 nullifier, address recipient, uint256 amount) external',
        'function isNullifierUsed(bytes32 nullifier) external view returns (bool)',
        'function getMerkleRoot() external view returns (bytes32)',
        'event Deposit(bytes32 indexed commitment, uint256 leafIndex, uint256 timestamp)',
        'event Withdrawal(address indexed recipient, bytes32 nullifier, uint256 amount)'
      ];
      
      this.shieldContract = new ethers.Contract(shieldAddress, shieldABI, this.provider);
    }
    
    // 尝试从 localStorage 加载已保存的密钥
    this.loadPrivacyKeys();
  }
  
  /**
   * 从 localStorage 加载隐私密钥
   */
  private loadPrivacyKeys(): void {
    try {
      const stored = localStorage.getItem('privacy_keys');
      if (stored) {
        this.privacyKeys = JSON.parse(stored);
        console.log('SDK: 已加载保存的隐私密钥');
      }
    } catch (error) {
      console.error('SDK: 加载隐私密钥失败:', error);
    }
  }
  
  /**
   * 设置隐私密钥（供外部调用）
   */
  setPrivacyKeys(keys: PrivacyKeys): void {
    this.privacyKeys = keys;
    console.log('SDK: 隐私密钥已设置');
  }

  /**
   * 1. 密钥派生（基于 EIP-712 签名）
   */
  async deriveKeys(signer: ethers.Signer): Promise<PrivacyKeys> {
    const address = await signer.getAddress();
    const chainId = (await this.provider.getNetwork()).chainId;

    // EIP-712 Domain
    // 使用固定的合约地址，而不是用户地址
    const domain = {
      name: 'Atoshi Privacy',
      version: '1',
      chainId: Number(chainId),
      verifyingContract: '0x0000000000000000000000000000000000000001' // 使用固定地址
    };

    // EIP-712 Message
    const types = {
      PrivacyActivation: [
        { name: 'purpose', type: 'string' },
        { name: 'account', type: 'address' },
        { name: 'timestamp', type: 'uint256' }
      ]
    };

    const message = {
      purpose: 'Activate Atoshi Privacy Layer',
      account: address,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // 签名
    const signature = await signer.signTypedData(domain, types, message);

    // 派生密钥
    const seed = poseidonHash(signature);
    const spendingKey = poseidonHash(seed, 'spending');
    const viewingKey = poseidonHash(seed, 'viewing');
    const publicAddress = poseidonHash(spendingKey).slice(0, 42); // 模拟公钥

    const keys: PrivacyKeys = {
      spendingKey,
      viewingKey,
      publicAddress,
      isInitialized: true
    };

    this.privacyKeys = keys;
    return keys;
  }

  /**
   * 2. Shield（存款）- 明文 → 隐私
   */
  async shield(
    signer: ethers.Signer,
    amount: bigint,
    recipient?: string
  ): Promise<Transaction> {
    if (!this.shieldContract) {
      throw new Error('Shield contract not initialized');
    }

    if (!this.privacyKeys) {
      throw new Error('Privacy keys not initialized. Call deriveKeys() first.');
    }

    // 生成 Note
    const note = this.generateNote(
      amount,
      recipient || this.privacyKeys.publicAddress
    );

    // 生成 Commitment
    const commitment = this.computeCommitment(note);

    // 调用合约
    const contract = this.shieldContract.connect(signer);
    const tx = await contract.deposit(commitment, { value: amount });
    const receipt = await tx.wait();

    // 保存 Note 到本地存储
    this.saveNote(note);

    return {
      id: receipt.hash,
      type: TransactionType.SHIELD,
      amount: ethers.formatEther(amount),
      asset: 'ETH',
      timestamp: Date.now(),
      from: await signer.getAddress(),
      to: this.privacyKeys.publicAddress,
      status: 'completed',
      txHash: receipt.hash
    };
  }

  /**
   * 3. 隐私转账（隐私 → 隐私）
   */
  async privateSend(
    amount: bigint,
    recipientAddress: string
  ): Promise<Transaction> {
    if (!this.privacyKeys) {
      throw new Error('Privacy keys not initialized');
    }

    // 1. 选择要消耗的 Note
    const inputNotes = await this.selectNotes(amount);
    
    // 2. 生成新的 Note（给接收方）
    const outputNote = this.generateNote(amount, recipientAddress);
    
    // 3. 计算找零（如果有）
    const totalInput = inputNotes.reduce((sum, note) => sum + note.amount, 0n);
    const change = totalInput - amount;
    const changeNote = change > 0n 
      ? this.generateNote(change, this.privacyKeys.publicAddress)
      : null;

    // 4. 生成 Nullifiers
    const nullifiers = inputNotes.map(note => this.computeNullifier(note));

    // 5. 生成 ZK Proof（模拟）
    const proof = await this.generateProof({
      inputNotes,
      outputNotes: changeNote ? [outputNote, changeNote] : [outputNote],
      nullifiers
    });

    // 6. 提交到 Sequencer（模拟）
    // TODO: 实际应该调用 Sequencer API
    const txId = `priv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 7. 保存新 Note
    this.saveNote(outputNote);
    if (changeNote) this.saveNote(changeNote);

    // 8. 标记旧 Note 为已使用
    inputNotes.forEach(note => this.markNoteAsSpent(note));

    return {
      id: txId,
      type: TransactionType.PRIVATE_SEND,
      amount: ethers.formatEther(amount),
      asset: 'ATOS',
      timestamp: Date.now(),
      from: this.privacyKeys.publicAddress,
      to: recipientAddress,
      status: 'completed',
      nullifier: nullifiers[0]
    };
  }

  /**
   * 4. Unshield（提款）- 隐私 → 明文
   */
  async unshield(
    signer: ethers.Signer,
    amount: bigint,
    recipient: string
  ): Promise<Transaction> {
    if (!this.shieldContract) {
      throw new Error('Shield contract not initialized');
    }

    if (!this.privacyKeys) {
      throw new Error('Privacy keys not initialized');
    }

    // 1. 选择要消耗的 Note
    const inputNotes = await this.selectNotes(amount);

    // 2. 生成 Nullifier
    const nullifier = this.computeNullifier(inputNotes[0]);

    // 3. 生成 ZK Proof
    const proof = await this.generateProof({
      inputNotes,
      outputNotes: [],
      nullifiers: [nullifier],
      publicAmount: amount,
      publicRecipient: recipient
    });

    // 4. 调用合约
    const contract = this.shieldContract.connect(signer);
    const tx = await contract.withdraw(proof, nullifier, recipient, amount);
    const receipt = await tx.wait();

    // 5. 标记 Note 为已使用
    inputNotes.forEach(note => this.markNoteAsSpent(note));

    return {
      id: receipt.hash,
      type: TransactionType.UNSHIELD,
      amount: ethers.formatEther(amount),
      asset: 'ETH',
      timestamp: Date.now(),
      from: this.privacyKeys.publicAddress,
      to: recipient,
      status: 'completed',
      txHash: receipt.hash,
      nullifier
    };
  }

  /**
   * 5. 扫描 Note（查询余额）
   */
  async scanNotes(): Promise<Note[]> {
    if (!this.shieldContract || !this.privacyKeys) {
      return [];
    }

    // 从本地存储加载 Note
    const notes = this.loadNotes();
    
    // TODO: 从链上事件扫描新的 Note
    // const filter = this.shieldContract.filters.Deposit();
    // const events = await this.shieldContract.queryFilter(filter);
    
    return notes.filter(note => !note.spent);
  }

  /**
   * 获取隐私余额
   */
  async getPrivateBalance(): Promise<bigint> {
    const notes = await this.scanNotes();
    return notes.reduce((sum, note) => sum + note.amount, 0n);
  }

  // ==================== 辅助方法 ====================

  private generateNote(amount: bigint, recipient: string): Note {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const nullifier = ethers.hexlify(ethers.randomBytes(32));
    
    return {
      amount,
      secret,
      nullifier,
      recipient,
      spent: false,
      leafIndex: -1 // 将在存款时更新
    };
  }

  private computeCommitment(note: Note): string {
    return poseidonHash(
      note.amount.toString(),
      note.secret,
      note.nullifier,
      note.recipient
    );
  }

  private computeNullifier(note: Note): string {
    if (!this.privacyKeys) {
      throw new Error('Privacy keys not initialized');
    }
    return poseidonHash(note.nullifier, this.privacyKeys.spendingKey);
  }

  private async selectNotes(amount: bigint): Promise<Note[]> {
    const notes = await this.scanNotes();
    const selected: Note[] = [];
    let total = 0n;

    for (const note of notes) {
      if (!note.spent) {
        selected.push(note);
        total += note.amount;
        if (total >= amount) break;
      }
    }

    if (total < amount) {
      throw new Error('Insufficient private balance');
    }

    return selected;
  }

  private async generateProof(inputs: any): Promise<string> {
    // TODO: 调用真实的 Prover
    // 这里返回模拟的 proof
    return ethers.hexlify(ethers.randomBytes(128));
  }

  // ==================== 本地存储 ====================

  private saveNote(note: Note): void {
    const notes = this.loadNotes();
    // 将 BigInt 转换为字符串以便序列化
    const serializedNote = {
      amount: note.amount.toString(),
      secret: note.secret,
      nullifier: note.nullifier,
      recipient: note.recipient,
      spent: note.spent,
      leafIndex: note.leafIndex
    };
    notes.push(note);
    
    // 序列化时转换 BigInt
    const serializedNotes = notes.map(n => ({
      amount: n.amount.toString(),
      secret: n.secret,
      nullifier: n.nullifier,
      recipient: n.recipient,
      spent: n.spent,
      leafIndex: n.leafIndex
    }));
    
    localStorage.setItem('privacy_notes', JSON.stringify(serializedNotes));
  }

  private loadNotes(): Note[] {
    try {
      const stored = localStorage.getItem('privacy_notes');
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      // 将字符串转换回 BigInt
      return parsed.map((n: any) => ({
        amount: BigInt(n.amount),
        secret: n.secret,
        nullifier: n.nullifier,
        recipient: n.recipient,
        spent: n.spent,
        leafIndex: n.leafIndex
      }));
    } catch (error) {
      console.error('SDK: 加载 Notes 失败:', error);
      return [];
    }
  }

  private markNoteAsSpent(note: Note): void {
    const notes = this.loadNotes();
    const index = notes.findIndex(n => n.nullifier === note.nullifier);
    if (index !== -1) {
      notes[index].spent = true;
      
      // 序列化时转换 BigInt
      const serializedNotes = notes.map(n => ({
        amount: n.amount.toString(),
        secret: n.secret,
        nullifier: n.nullifier,
        recipient: n.recipient,
        spent: n.spent,
        leafIndex: n.leafIndex
      }));
      
      localStorage.setItem('privacy_notes', JSON.stringify(serializedNotes));
    }
  }
}

// 导出单例
let sdkInstance: PrivacySDK | null = null;

export function getPrivacySDK(rpcUrl: string, shieldAddress?: string): PrivacySDK {
  if (!sdkInstance) {
    sdkInstance = new PrivacySDK(rpcUrl, shieldAddress);
  }
  return sdkInstance;
}

