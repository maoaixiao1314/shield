/**
 * Atoshi Privacy Wallet 配置
 */

export const config = {
  // L2 RPC 配置
  l2: {
    rpcUrl: import.meta.env.VITE_L2_RPC_URL || 'http://52.76.210.218:8123',
    chainId: parseInt(import.meta.env.VITE_L2_CHAIN_ID || '67890'),
    name: 'Atoshi L2'
  },

  // 合约地址
  contracts: {
    shield: import.meta.env.VITE_SHIELD_CONTRACT || '0x2942ACf67055b1520904227d13789cc03C8CBa8C',
    verifier: import.meta.env.VITE_VERIFIER_CONTRACT || '0x411a113d3E8Ba7cDc38e103A95BFb7193135De64',
    tokenRegistry: import.meta.env.VITE_TOKEN_REGISTRY_CONTRACT || '0xbC8360dAB1830f9E63a5d0F94d4145eb61C9Ea79'
  },

  // Prover 配置
  prover: {
    url: import.meta.env.VITE_PROVER_URL || 'http://localhost:8080',
    useWasm: import.meta.env.VITE_USE_WASM_PROVER === 'true' || true // 默认使用浏览器 WASM Prover
  },

  // 演示模式（合约未部署时使用模拟数据）
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true' || false
};

export default config;
