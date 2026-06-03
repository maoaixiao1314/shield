/**
 * Atoshi Privacy Wallet configuration
 */

export const config = {
  // L2 RPC configuration
  l2: {
    rpcUrl: import.meta.env.VITE_L2_RPC_URL || 'http://52.76.210.218:8123',
    chainId: parseInt(import.meta.env.VITE_L2_CHAIN_ID || '67890'),
    name: 'Atoshi L2'
  },

  // Contract addresses
  contracts: {
    shield: import.meta.env.VITE_SHIELD_CONTRACT || '0x4A951a4Bc79F156c0658d71675dcC5b2348E95DB',
    verifier: import.meta.env.VITE_VERIFIER_CONTRACT || '0x411a113d3E8Ba7cDc38e103A95BFb7193135De64',
    tokenRegistry: import.meta.env.VITE_TOKEN_REGISTRY_CONTRACT || '0xbC8360dAB1830f9E63a5d0F94d4145eb61C9Ea79'
  },

  // Prover configuration
  prover: {
    url: import.meta.env.VITE_PROVER_URL || 'http://localhost:8080',
    useWasm: import.meta.env.VITE_USE_WASM_PROVER === 'true' || true // Use the browser WASM Prover by default
  },

  // Demo mode (uses mock data when contracts are not deployed)
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true' || false
};

export default config;
