/**
 * Transaction History API Service
 */

import { Transaction } from '../types';

const BASE_URL = 'http://52.76.210.218:4100';

export interface TransactionResponse {
  success: boolean;
  data: {
    transactions: Transaction[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Fetch transaction history for a given address
 * @param address - Wallet address (0x prefixed)
 * @returns Array of transactions
 */
export async function fetchTransactions(address: string): Promise<Transaction[]> {
  try {
    const normalizedAddress = address.toLowerCase();
    // Don't pass pagination params - backend will return all transactions by default
    const url = `${BASE_URL}/transactions/${normalizedAddress}`;

    console.log('[API] Fetching transactions from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: TransactionResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch transactions');
    }

    console.log(`[API] Fetched ${result.data.transactions.length} transactions`);

    // Add mock transaction for testing (temporary, for demo purposes)
    const mockTransaction: Transaction = {
      id: 'mock-tx-001',
      type: 'TRANSFER' as any,
      amount: '1.23456789 ATOS',
      asset: 'ATOS',
      timestamp: Date.now(),
      from: address.toLowerCase(),
      to: '0xabcdef1234567890abcdef1234567890abcdef12',
      status: 'completed',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      blockNumber: 123456,
      gasUsed: '21000',
      gasPrice: '2000000000',
    };

    const transactionsWithMock = [...result.data.transactions, mockTransaction];
    console.log(`[API] Added mock transaction, total: ${transactionsWithMock.length}`);

    return transactionsWithMock;
  } catch (error) {
    console.error('[API] Failed to fetch transactions:', error);
    throw error;
  }
}
