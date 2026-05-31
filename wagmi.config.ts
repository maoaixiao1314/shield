import { getDefaultConfig } from '@rainbow-me/rainbowkit';
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
      http: [import.meta.env.VITE_L2_RPC_URL || 'http://52.76.210.218:8123'],
    },
    public: {
      http: [import.meta.env.VITE_L2_RPC_URL || 'http://52.76.210.218:8123'],
    },
  },
  blockExplorers: {
    default: { name: 'Atoshi L2 Explorer', url: 'http://52.76.210.218:4001' },
  },
});

// ============================================================================
// WalletConnect Project ID
// ============================================================================
//
// This ID is used for:
// 1. WalletConnect relay service authentication (free, limited to 500 req/s)
// 2. Displaying the wallet list/icons in the RainbowKit UI
//
// How to get it:
// 1. Open https://cloud.reown.com (= formerly cloud.walletconnect.com)
// 2. Register / log in (email registration is fine)
// 3. Create a project (set the project name to "Atoshi Privacy" or similar)
// 4. Copy the Project ID (a 32-character hexadecimal string)
// 5. Set the environment variable VITE_WC_PROJECT_ID or fill it in below
//
// If left empty:
// - Desktop users cannot use WalletConnect to connect arbitrary wallets (the QR scan feature breaks)
// - But the Atoshi wallet's built-in browser path is unaffected (it uses EIP-1193 injection)
//
// The placeholder ID is for development only: register a free account at cloud.reown.com to get a real ID
// ============================================================================
const WALLET_CONNECT_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID || 'PLEASE_REGISTER_AT_cloud.reown.com';

export const wagmiConfig = getDefaultConfig({
  appName: 'Atoshi Privacy',
  appDescription: 'Privacy-preserving transactions on Atoshi L2',
  appUrl: 'https://privacy.atoshi.xyz',
  appIcon: 'https://privacy.atoshi.xyz/icon.png',
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [atoshiL2],
  ssr: false,
});

