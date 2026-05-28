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
// 这个 ID 用来:
// 1. WalletConnect 中继服务认证 (免费, 限 500 req/s)
// 2. 钱包列表/图标在 RainbowKit UI 显示
//
// 怎么拿:
// 1. 打开 https://cloud.reown.com (= 原 cloud.walletconnect.com)
// 2. 注册 / 登录 (邮箱注册即可)
// 3. 创建一个项目 (项目名填 "Atoshi Privacy" 或类似)
// 4. 复制 Project ID (32 字符的十六进制)
// 5. 设置环境变量 VITE_WC_PROJECT_ID 或填到下面
//
// 不填会:
// - 桌面用户没法用 WalletConnect 连任意钱包 (扫码功能挂)
// - 但是 Atoshi 钱包内置浏览器路径不受影响 (走 EIP-1193 注入)
//
// 占位 ID 仅用于开发: 在 cloud.reown.com 注册免费账号即可拿真实 ID
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

