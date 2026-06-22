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

    return result.data.transactions;
  } catch (error) {
    console.error('[API] Failed to fetch transactions:', error);
    throw error;
  }
}
