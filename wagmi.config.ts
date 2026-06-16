import { http, createConfig, injected } from 'wagmi';
import { metaMask } from 'wagmi/connectors';
import { defineChain } from 'viem';

// Define the Atoshi L2 network
export const atoshiL2 = defineChain({
  id: 67890,
  name: 'Atoshi L2',
  nativeCurrency: {
    decimals: 18,
    name: 'Atoshi',
    symbol: 'ATOSHI',
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_L2_RPC_URL || 'https://l2-rpc1-testnet.atoshi.org'],
    },
    public: {
      http: [import.meta.env.VITE_L2_RPC_URL || 'https://l2-rpc1-testnet.atoshi.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Atoshi L2 Explorer', url: 'http://52.76.210.218:4001' },
  },
});

// Create a custom config that supports any injected wallet (including Atoshi)
// This configuration uses wagmi's native injected connector to support:
// - Atoshi Wallet (detected via window.ethereum.isAtoshi)
// - MetaMask, Rabby, Coinbase, and other EIP-1193 wallets
export const wagmiConfig = createConfig({
  chains: [atoshiL2],
  connectors: [
    // Priority 1: Injected connector for all wallets (Atoshi, Rabby, etc.)
    injected({
      shimDisconnect: true,
      name: () => {
        // Custom name detection for wallets
        if (typeof window !== 'undefined' && (window as any).ethereum) {
          const provider = (window as any).ethereum;
          if (provider.isAtoshi) {
            return 'Atoshi Wallet';
          }
          if (provider.isRabby) {
            return 'Rabby';
          }
          if (provider.isCoinbaseWallet) {
            return 'Coinbase Wallet';
          }
          if (provider.isTrust) {
            return 'Trust Wallet';
          }
        }
        return 'Injected Wallet';
      },
    }),
    // Priority 2: MetaMask connector as fallback
    metaMask({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [atoshiL2.id]: http(),
  },
});

