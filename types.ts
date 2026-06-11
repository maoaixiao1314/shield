
export enum AssetType {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE'
}

export enum TransactionType {
  TRANSFER = 'TRANSFER',      // Public -> Public
  SHIELD = 'SHIELD',          // Public -> Private (Deposit)
  UNSHIELD = 'UNSHIELD',      // Private -> Public (Withdraw)
  PRIVATE_SEND = 'PRIVATE_SEND', // Private -> Private
  BRIDGE_DEPOSIT = 'BRIDGE_DEPOSIT', // L1 -> L2 Bridge
  BRIDGE_WITHDRAW = 'BRIDGE_WITHDRAW' // L2 -> L1 Bridge
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: string;
  asset: string;
  timestamp: number;
  from: string;
  to: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string; // Optional for private txs
  nullifier?: string; // Only for private txs
}

export interface PrivacyKeys {
  spendingKey: string;
  viewingKey: string;
  publicAddress: string;
  isInitialized: boolean;
}

export interface WalletState {
  publicBalance: string;
  privateBalance: string;
  address: string;
  privacyKeys: PrivacyKeys;
}

// Note structure (the core of privacy transactions)
export interface Note {
  amount: bigint;
  secret: string;
  nullifier: string;
  recipient: string;
  spent: boolean;
  leafIndex: number;
}
