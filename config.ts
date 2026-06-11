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

  // L1 configuration for bridge
  l1: {
    rpcUrl: import.meta.env.VITE_L1_RPC_URL || 'https://rpc-testnet.atoshi.org',
    chainId: parseInt(import.meta.env.VITE_L1_CHAIN_ID || '88288'),
    name: 'Atoshi L1'
  },

  // Contract addresses
  contracts: {
    shield: import.meta.env.VITE_SHIELD_CONTRACT || '0x4A951a4Bc79F156c0658d71675dcC5b2348E95DB',
    verifier: import.meta.env.VITE_VERIFIER_CONTRACT || '0x411a113d3E8Ba7cDc38e103A95BFb7193135De64',
    tokenRegistry: import.meta.env.VITE_TOKEN_REGISTRY_CONTRACT || '0xbC8360dAB1830f9E63a5d0F94d4145eb61C9Ea79',
    // Bridge contracts
    l1Bridge: import.meta.env.VITE_L1_BRIDGE_CONTRACT || '0xC241A13b93b3969e15303c194520Fc2f950F7F4b',
    l2Bridge: import.meta.env.VITE_L2_BRIDGE_CONTRACT || '0x0101481FA81E3044934CD905d322f4F5f116cc55'
  },

  // Bridge service configuration
  bridge: {
    serviceUrl: import.meta.env.VITE_BRIDGE_SERVICE_URL || 'http://52.76.210.218:8080'
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
