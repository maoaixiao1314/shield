
export enum AssetType {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE'
}

export enum TransactionType {
  TRANSFER = 'TRANSFER',      // Public -> Public
  SHIELD = 'SHIELD',          // Public -> Private (Deposit)
  UNSHIELD = 'UNSHIELD',      // Private -> Public (Withdraw)
  PRIVATE_SEND = 'PRIVATE_SEND' // Private -> Private
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
