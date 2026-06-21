/**
 * Atoshi Privacy SDK
 *
 * Provides complete privacy transaction functionality:
 * - Key derivation (based on EIP-712 signatures)
 * - Shield (deposit)
 * - Private transfers
 * - Unshield (withdrawal)
 * - Note scanning and balance queries
 */

import { ethers } from 'ethers';
import { PrivacyKeys, Note, Transaction, TransactionType } from '../types';

// Poseidon Hash simulation (should actually use circomlibjs)
// TODO: Replace with the real Poseidon Hash
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
      // Shield contract ABI (simplified version)
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

    // Attempt to load saved keys from localStorage
    this.loadPrivacyKeys();
  }

  /**
   * Load privacy keys from localStorage
   */
  private loadPrivacyKeys(): void {
    try {
      const stored = localStorage.getItem('privacy_keys');
      if (stored) {
        this.privacyKeys = JSON.parse(stored);
        console.log('SDK: Loaded saved privacy keys');
      }
    } catch (error) {
      console.error('SDK: Failed to load privacy keys:', error);
    }
  }

  /**
   * Set privacy keys (for external calls)
   */
  setPrivacyKeys(keys: PrivacyKeys): void {
    this.privacyKeys = keys;
    console.log('SDK: Privacy keys have been set');
  }

  /**
   * 1. Key derivation (based on EIP-712 signatures)
   */
  async deriveKeys(signer: ethers.Signer): Promise<PrivacyKeys> {
    const address = await signer.getAddress();
    const chainId = (await this.provider.getNetwork()).chainId;

    // EIP-712 Domain
    // Use a fixed contract address instead of the user address
    const domain = {
      name: 'Atoshi Privacy',
      version: '1',
      chainId: Number(chainId),
      verifyingContract: '0x0000000000000000000000000000000000000001' // Use a fixed address
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

    // Sign
    const signature = await signer.signTypedData(domain, types, message);

    // Derive keys
    const seed = poseidonHash(signature);
    const spendingKey = poseidonHash(seed, 'spending');
    const viewingKey = poseidonHash(seed, 'viewing');
    const publicAddress = poseidonHash(spendingKey).slice(0, 42); // Simulated public key

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
   * 2. Shield (deposit) - plaintext -> private
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

    // Generate Note
    const note = this.generateNote(
      amount,
      recipient || this.privacyKeys.publicAddress
    );

    // Generate Commitment
    const commitment = this.computeCommitment(note);

    // Call the contract
    const contract = this.shieldContract.connect(signer);
    const tx = await contract.deposit(commitment, { value: amount });
    const receipt = await tx.wait();

    // Save the Note to local storage
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
   * 3. Private transfer (private -> private)
   */
  async privateSend(
    amount: bigint,
    recipientAddress: string
  ): Promise<Transaction> {
    if (!this.privacyKeys) {
      throw new Error('Privacy keys not initialized');
    }

    // 1. Select the Notes to spend
    const inputNotes = await this.selectNotes(amount);

    // 2. Generate a new Note (for the recipient)
    const outputNote = this.generateNote(amount, recipientAddress);

    // 3. Calculate the change (if any)
    const totalInput = inputNotes.reduce((sum, note) => sum + note.amount, 0n);
    const change = totalInput - amount;
    const changeNote = change > 0n
      ? this.generateNote(change, this.privacyKeys.publicAddress)
      : null;

    // 4. Generate Nullifiers
    const nullifiers = inputNotes.map(note => this.computeNullifier(note));

    // 5. Generate ZK Proof (simulated)
    const proof = await this.generateProof({
      inputNotes,
      outputNotes: changeNote ? [outputNote, changeNote] : [outputNote],
      nullifiers
    });

    // 6. Submit to the Sequencer (simulated)
    // TODO: Should actually call the Sequencer API
    const txId = `priv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 7. Save the new Notes
    this.saveNote(outputNote);
    if (changeNote) this.saveNote(changeNote);

    // 8. Mark the old Notes as spent
    inputNotes.forEach(note => this.markNoteAsSpent(note));

    return {
      id: txId,
      type: TransactionType.PRIVATE_SEND,
      amount: ethers.formatEther(amount),
      asset: 'ATOStest',
      timestamp: Date.now(),
      from: this.privacyKeys.publicAddress,
      to: recipientAddress,
      status: 'completed',
      nullifier: nullifiers[0]
    };
  }

  /**
   * 4. Unshield (withdrawal) - private -> plaintext
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

    // 1. Select the Notes to spend
    const inputNotes = await this.selectNotes(amount);

    // 2. Generate Nullifier
    const nullifier = this.computeNullifier(inputNotes[0]);

    // 3. Generate ZK Proof
    const proof = await this.generateProof({
      inputNotes,
      outputNotes: [],
      nullifiers: [nullifier],
      publicAmount: amount,
      publicRecipient: recipient
    });

    // 4. Call the contract
    const contract = this.shieldContract.connect(signer);
    const tx = await contract.withdraw(proof, nullifier, recipient, amount);
    const receipt = await tx.wait();

    // 5. Mark the Note as spent
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
   * 5. Scan Notes (query balance)
   */
  async scanNotes(): Promise<Note[]> {
    if (!this.shieldContract || !this.privacyKeys) {
      return [];
    }

    // Load Notes from local storage
    const notes = this.loadNotes();

    // TODO: Scan new Notes from on-chain events
    // const filter = this.shieldContract.filters.Deposit();
    // const events = await this.shieldContract.queryFilter(filter);

    return notes.filter(note => !note.spent);
  }

  /**
   * Get the private balance
   */
  async getPrivateBalance(): Promise<bigint> {
    const notes = await this.scanNotes();
    return notes.reduce((sum, note) => sum + note.amount, 0n);
  }

  // ==================== Helper methods ====================

  private generateNote(amount: bigint, recipient: string): Note {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const nullifier = ethers.hexlify(ethers.randomBytes(32));

    return {
      amount,
      secret,
      nullifier,
      recipient,
      spent: false,
      leafIndex: -1 // Will be updated at deposit time
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
    // TODO: Call the real Prover
    // Returns a simulated proof here
    return ethers.hexlify(ethers.randomBytes(128));
  }

  // ==================== Local storage ====================

  private saveNote(note: Note): void {
    const notes = this.loadNotes();
    // Convert BigInt to string for serialization
    const serializedNote = {
      amount: note.amount.toString(),
      secret: note.secret,
      nullifier: note.nullifier,
      recipient: note.recipient,
      spent: note.spent,
      leafIndex: note.leafIndex
    };
    notes.push(note);

    // Convert BigInt during serialization
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
      // Convert strings back to BigInt
      return parsed.map((n: any) => ({
        amount: BigInt(n.amount),
        secret: n.secret,
        nullifier: n.nullifier,
        recipient: n.recipient,
        spent: n.spent,
        leafIndex: n.leafIndex
      }));
    } catch (error) {
      console.error('SDK: Failed to load Notes:', error);
      return [];
    }
  }

  private markNoteAsSpent(note: Note): void {
    const notes = this.loadNotes();
    const index = notes.findIndex(n => n.nullifier === note.nullifier);
    if (index !== -1) {
      notes[index].spent = true;

      // Convert BigInt during serialization
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

// Export singleton
let sdkInstance: PrivacySDK | null = null;

export function getPrivacySDK(rpcUrl: string, shieldAddress?: string): PrivacySDK {
  if (!sdkInstance) {
    sdkInstance = new PrivacySDK(rpcUrl, shieldAddress);
  }
  return sdkInstance;
}

