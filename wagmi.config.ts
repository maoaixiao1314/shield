import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

// 定义 Atoshi L2 网络
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
      http: ['http://52.76.210.218:8123'],
    },
    public: {
      http: ['http://52.76.210.218:8123'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: '' },
  },
});

export const wagmiConfig = getDefaultConfig({
  appName: 'Atoshi Privacy Wallet',
  projectId: 'YOUR_PROJECT_ID', // 可以从 WalletConnect Cloud 获取，或使用默认值
  chains: [atoshiL2],
  ssr: false,
});

