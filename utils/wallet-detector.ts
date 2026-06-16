/**
 * Wallet detection utility
 * Detects the type of Ethereum wallet in the browser environment
 */

export type WalletType = 'atoshi' | 'metamask' | 'rabby' | 'coinbase' | 'trust' | 'unknown' | null;

export interface WalletInfo {
  type: WalletType;
  name: string;
  provider?: any;
}

/**
 * Detect wallet type from window.ethereum
 * @returns Wallet information or null if no wallet detected
 */
export async function detectWallet(): Promise<WalletInfo | null> {
  // Check if ethereum provider exists
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    console.log('[Wallet Detection] No wallet detected');
    return null;
  }

  const provider = (window as any).ethereum;

  // Priority 1: Atoshi Wallet (highest priority for our project)
  if (provider.isAtoshi === true) {
    console.log('[Wallet Detection] ✅ Detected Atoshi wallet');
    return {
      type: 'atoshi',
      name: 'Atoshi Wallet',
      provider,
    };
  }

  // Priority 2: Rabby Wallet (popular alternative)
  if (provider.isRabby === true) {
    console.log('[Wallet Detection] ✅ Detected Rabby wallet');
    return {
      type: 'rabby',
      name: 'Rabby Wallet',
      provider,
    };
  }

  // Priority 3: Coinbase Wallet
  if (provider.isCoinbaseWallet === true) {
    console.log('[Wallet Detection] ✅ Detected Coinbase Wallet');
    return {
      type: 'coinbase',
      name: 'Coinbase Wallet',
      provider,
    };
  }

  // Priority 4: Trust Wallet
  if (provider.isTrust === true) {
    console.log('[Wallet Detection] ✅ Detected Trust Wallet');
    return {
      type: 'trust',
      name: 'Trust Wallet',
      provider,
    };
  }

  // Priority 5: MetaMask (most common)
  if (provider.isMetaMask === true) {
    console.log('[Wallet Detection] ✅ Detected MetaMask');
    return {
      type: 'metamask',
      name: 'MetaMask',
      provider,
    };
  }

  // Unknown wallet type
  console.log('[Wallet Detection] ⚠️ Unknown wallet type');
  return {
    type: 'unknown',
    name: provider._name || 'Browser Wallet',
    provider,
  };
}

/**
 * Get human-readable wallet name
 * @param walletType Wallet type from detectWallet()
 * @returns Display name for the wallet
 */
export function getWalletDisplayName(walletType: WalletType): string {
  switch (walletType) {
    case 'atoshi':
      return 'Atoshi Wallet';
    case 'metamask':
      return 'MetaMask';
    case 'rabby':
      return 'Rabby Wallet';
    case 'coinbase':
      return 'Coinbase Wallet';
    case 'trust':
      return 'Trust Wallet';
    case 'unknown':
      return 'Browser Wallet';
    default:
      return 'Connect Wallet';
  }
}

/**
 * Check if running in Atoshi wallet environment
 * @returns true if in Atoshi wallet
 */
export function isAtoshiWallet(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any).ethereum?.isAtoshi === true;
}

/**
 * Check if ethereum provider is available
 * @returns true if any wallet is detected
 */
export function hasEthereumProvider(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).ethereum;
}
