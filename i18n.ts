import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 中文翻译
const zh = {
  // Common
  welcome: '欢迎',
  loading: '加载中...',
  processing: '处理中...',
  connecting: '连接中...',
  confirm: '确认',
  cancel: '取消',
  clearHistory: '清除历史',
  clearHistoryConfirm: '确定要清除所有交易历史吗？',
  public: '公开',
  private: '隐私',
  connectWallet: '连接钱包',
  noWalletDetected: '未检测到钱包，请使用钱包访问本应用',
  walletConnectionFailed: '钱包连接失败',
  connectionFailed: '连接失败',
  
  // Transaction Types (HistoryItem.tsx)
  transactionType: {
    publicTransfer: '公开转账',
    depositShield: '充值(屏蔽)',
    withdrawUnshield: '提现(解除屏蔽)',
    shieldedTransfer: '隐私转账',
    transaction: '交易',
  },
  
  // App.tsx
  welcomeTitle: '欢迎来到 Atoshi Privacy',
  welcomeSubtitle: '连接您的钱包以访问隐私功能',
  notOnAtoshiL2: '⚠️ 当前不在 Atoshi L2 链上',
  currentChain: '当前链',
  needSwitchToL2: '需要切换到 Atoshi L2 (链',
  addNetworkTip: '💡 如果 MetaMask 从未添加过 Atoshi L2,点击下方按钮将自动添加',
  addAndSwitch: '➕ 添加并切换到 Atoshi L2',
  switch: '切换',
  failedToAdd: '添加失败',
  scanComplete: '扫描完成,已恢复',
  note: '个 Note',
  recoveryFailed: '恢复失败',
  scanningNotes: '⏳ 正在扫描链上 Notes...',
  recoverNotesFromChain: '🔄 从链上恢复 Notes',
  pleaseConnectFirst: '请先连接钱包!',
  initializePrivacyFirst: '请先初始化您的隐私身份(点击"设置隐私")',
  connectAndSwitchL2: '请先连接钱包并切换到 Atoshi L2 链(链 67890)',
  transactionSuccess: '交易成功',
  transactionFailed: '交易失败',
  userRefusedOperation: '用户拒绝了操作',
  unknownError: '未知错误',
  
  // Header.tsx
  mainnet: '主网',
  privacyLayer: '隐私层',
  uninitialized: '未初始化',
  disconnectConfirm: '⚠️ 完全重置:\n\n' +
    '1. 断开钱包连接\n' +
    '2. 清除 WalletConnect 会话缓存\n' +
    '3. 清除隐私密钥 (privacy_keys)\n' +
    '4. 清除本地 Note 缓存 (privacy_notes)\n' +
    '5. 清除链扫描进度 (last_scanned_block)\n\n' +
    '⚠️ 注意:本地 Notes 一旦清除无法恢复!链上 Notes 将使用新派生的密钥重新扫描\n' +
    '(如果使用相同的 EOA 通过 EIP-712 签名,跨设备恢复将拉回属于您的所有 Notes)。\n\n' +
    '确定要继续吗?',
  disconnectTitle: '断开钱包连接 + 清除会话缓存',
  fullyCleared: '✓ 已从 localStorage + sessionStorage 完全清除',
  items: '个项目',
  
  // SetupPrivacy.tsx
  activatePrivacy: '激活隐私层',
  deriveDesc: '使用您的 ETH 地址确定性派生 ZK 密钥。\n无需助记词 — 只需一次签名。',
  signToDerive: '签名以派生密钥',
  awaitingSignature: '等待签名...',
  poseidonHashing: 'Poseidon 哈希计算中...',
  keysSecured: '密钥已安全保存',
  initFailed: '初始化失败',
  architectureMapping: '架构映射',
  ethMasterKey: 'ETH 主密钥',
  eip712Signature: 'EIP-712 签名 (Atoshi v1)',
  privacySeed: '隐私种子 (Poseidon 输出)',
  
  // PublicDashboard.tsx
  publicBalance: '公开余额',
  depositFromWallet: '从钱包充值',
  withdrawToWallet: '提现到钱包',
  sendATOSHI: '发送 ATOSHI',
  shieldFunds: '屏蔽资金',
  recentPublicTxs: '最近公开交易',
  
  // PrivateDashboard.tsx
  shieldedAssets: '屏蔽资产',
  deterministicZKKeys: '确定性 ZK 密钥已激活',
  shieldedSend: '隐私发送',
  unshield: '解除屏蔽',
  privacyKeyInfo: '隐私密钥信息',
  hide: '隐藏',
  manage: '管理',
  keyInfoDesc: '这些密钥是从您的 ETH 签名确定性生成的。\n任何可以访问您 ETH 钱包的人都可以重新生成这些隐私密钥。',
  spendingKey: '支出密钥',
  viewingKey: '查看密钥',
  myReceivingCode: '我的隐私接收码(供他人转账给我)',
  qrCodeForOthers: '二维码 - 主要分享方式,对方只需扫描即可',
  showTextFormat: '▸ 显示文本格式(适合粘贴到聊天应用)',
  copyReceivingCode: '📋 复制接收码到剪贴板',
  receivingCodeCopied: '接收码已复制!发送给对方,他们可以在"隐私发送"时粘贴(或扫描上面的二维码)',
  privacyNoteList: '隐私 Note 列表(本地)',
  available: '可用',
  total: '总计',
  noNotesYet: '还没有 Note。进行一笔屏蔽交易,或点击"🔄 从链上恢复 NOTE"来同步。',
  spent: '已花费',
  pendingSync: '等待同步',
  sessionTransactions: '本次会话的交易记录',
  
  // ActionModal.tsx
  sendATOSHITitle: '发送 ATOSHI',
  privacySendTitle: '隐私发送',
  shieldFundsTitle: '屏蔽资金',
  unshieldFundsTitle: '解除屏蔽资金',
  depositTitle: '从钱包充值',
  withdrawTitle: '提现到钱包',
  zkProofDesc: '使用 ZK-SNARK 零知识证明进行隐私保护。',
  evmTxDesc: '标准 EVM 交易上链。',
  amount: '金额',
  receiverAddress: '接收方地址',
  receiverPrivacyAddress: '接收方隐私地址',
  pasteOrScan: '粘贴接收方的接收码或点击右侧扫描 →',
  scanQRCode: '扫描接收方的二维码',
  depositTo: '充值到',
  withdrawTo: '提现到',
  yourL2Address: '您的 L2 钱包地址',
  yourL1Address: '您的 L1 钱包地址',
  yourPrivacyPool: '您自己的隐私池(不需要接收方地址)',
  generatingZKProof: '本地生成 ZK 证明',
  transferForPrivacy: '将 ATOSHI 从您的钱包转移到 L2 以进行隐私交易。',
  bridgeWithdrawDesc: '将 ATOSHI 从 L2 桥接回 L1。由于 ZK 证明验证,这可能需要 1-2 小时。',
  privacyTxDesc: '资金将使用 nullifier 电路转移。公共浏览器上看不到任何链接数据。',
  publicTxDesc: '这是一笔公开交易。详细信息将对任何人可见。',
};

// English translations
const en = {
  // Common
  welcome: 'Welcome',
  loading: 'Loading...',
  processing: 'Processing...',
  connecting: 'Connecting...',
  confirm: 'Confirm',
  cancel: 'Cancel',
  clearHistory: 'Clear History',
  clearHistoryConfirm: 'Are you sure you want to clear all transaction history?',
  public: 'Public',
  private: 'Private',
  connectWallet: 'Connect Wallet',
  noWalletDetected: 'No wallet detected. Please use a wallet to access this app',
  walletConnectionFailed: 'Wallet connection failed',
  connectionFailed: 'Connection failed',
  
  // Transaction Types (HistoryItem.tsx)
  transactionType: {
    publicTransfer: 'Public Transfer',
    depositShield: 'Deposit (Shield)',
    withdrawUnshield: 'Withdraw (Unshield)',
    shieldedTransfer: 'Shielded Transfer',
    transaction: 'Transaction',
  },
  
  // App.tsx
  welcomeTitle: 'Welcome to Atoshi Privacy',
  welcomeSubtitle: 'Connect your wallet to access privacy features',
  notOnAtoshiL2: '⚠️ Not currently on the Atoshi L2 chain',
  currentChain: 'Current chain',
  needSwitchToL2: 'need to switch to Atoshi L2 (chain',
  addNetworkTip: '💡 If MetaMask has never added Atoshi L2, clicking the button below will add it automatically.',
  addAndSwitch: '➕ Add and switch to Atoshi L2',
  switch: 'Switch',
  failedToAdd: 'Failed to add',
  scanComplete: 'Scan complete, recovered',
  note: 'Note(s)',
  recoveryFailed: 'Recovery failed',
  scanningNotes: '⏳ Scanning Notes on chain...',
  recoverNotesFromChain: '🔄 Recover Notes from chain',
  pleaseConnectFirst: 'Please connect your wallet first!',
  initializePrivacyFirst: 'Please initialize your privacy identity first (click "Setup Privacy")',
  connectAndSwitchL2: 'Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)',
  transactionSuccess: 'Transaction successful',
  transactionFailed: 'Transaction failed',
  userRefusedOperation: 'User refused the operation',
  unknownError: 'Unknown error',
  
  // Header.tsx
  mainnet: 'Mainnet',
  privacyLayer: 'Privacy Layer',
  uninitialized: 'Uninitialized',
  disconnectConfirm: '⚠️ Full reset:\n\n' +
    '1. Disconnect wallet\n' +
    '2. Clear WalletConnect session cache\n' +
    '3. Clear privacy keys (privacy_keys)\n' +
    '4. Clear local Note cache (privacy_notes)\n' +
    '5. Clear chain scan progress (last_scanned_block)\n\n' +
    '⚠️ Note: Local Notes cannot be recovered once cleared! On-chain Notes will be re-scanned using newly derived keys ' +
    '(if signed with EIP-712 by the same EOA, cross-device recovery will pull back all Notes belonging to you).\n\n' +
    'Are you sure you want to continue?',
  disconnectTitle: 'Disconnect wallet + clear session cache',
  fullyCleared: '✓ Fully cleared',
  items: 'items',
  
  // SetupPrivacy.tsx
  activatePrivacy: 'Activate Privacy Layer',
  deriveDesc: 'Deterministically derive your ZK-Keys using your ETH address.\nNo mnemonic needed — just one signature.',
  signToDerive: 'Sign to Derive Keys',
  awaitingSignature: 'Awaiting Signature...',
  poseidonHashing: 'Poseidon Hashing...',
  keysSecured: 'Keys Secured',
  initFailed: 'Initialization failed',
  architectureMapping: 'Architecture Mapping',
  ethMasterKey: 'ETH Master Key',
  eip712Signature: 'EIP-712 Signature (Atoshi v1)',
  privacySeed: 'Privacy Seed (Poseidon Output)',
  
  // PublicDashboard.tsx
  publicBalance: 'Public Balance',
  depositFromWallet: 'Deposit from Wallet',
  withdrawToWallet: 'Withdraw to Wallet',
  sendATOSHI: 'Send ATOSHI',
  shieldFunds: 'Shield Funds',
  recentPublicTxs: 'Recent Public Txs',
  
  // PrivateDashboard.tsx
  shieldedAssets: 'Shielded Assets',
  deterministicZKKeys: 'Deterministic ZK-Keys Active',
  shieldedSend: 'Shielded Send',
  unshield: 'Unshield',
  privacyKeyInfo: 'Privacy Key Info',
  hide: 'Hide',
  manage: 'Manage',
  keyInfoDesc: 'These keys are deterministically generated from your ETH signature.\nAnyone with access to your ETH wallet can regenerate these privacy keys.',
  spendingKey: 'Spending Key',
  viewingKey: 'Viewing Key',
  myReceivingCode: 'My Privacy Receiving Code (for others to transfer to me)',
  qrCodeForOthers: 'QR code - the primary sharing method, the other party just scans it',
  showTextFormat: '▸ Show text format (for pasting into chat apps)',
  copyReceivingCode: '📋 Copy Receiving Code to Clipboard',
  receivingCodeCopied: 'Receiving code copied! Send it to the other party, and they can paste it when doing a "Shielded Send" (or scan the QR code above)',
  privacyNoteList: 'Privacy Note List (Local)',
  available: 'Available',
  total: 'Total',
  noNotesYet: 'No Notes yet. Shield a transaction, or click "🔄 Recover NOTE from chain" to sync.',
  spent: 'Spent',
  pendingSync: 'Pending Sync',
  sessionTransactions: "This Session's Transaction Records",
  
  // ActionModal.tsx
  sendATOSHITitle: 'Send ATOSHI',
  privacySendTitle: 'Privacy Send',
  shieldFundsTitle: 'Shield Funds',
  unshieldFundsTitle: 'Unshield Funds',
  depositTitle: 'Deposit from Wallet',
  withdrawTitle: 'Withdraw to Wallet',
  zkProofDesc: 'Using ZK-SNARK zero-knowledge proofs for privacy.',
  evmTxDesc: 'Standard EVM transaction on-chain.',
  amount: 'Amount',
  receiverAddress: 'Receiver Address',
  receiverPrivacyAddress: 'Receiver Privacy Address',
  pasteOrScan: "Paste the recipient's receiving code or tap scan on the right →",
  scanQRCode: "Scan the recipient's QR code",
  depositTo: 'Deposit to',
  withdrawTo: 'Withdraw to',
  yourL2Address: 'Your L2 wallet address',
  yourL1Address: 'Your L1 wallet address',
  yourPrivacyPool: 'Your own privacy pool (no recipient address required)',
  generatingZKProof: 'Generating ZK-Proof locally',
  transferForPrivacy: 'Transfer ATOSHI from your wallet to L2 for privacy transactions.',
  bridgeWithdrawDesc: 'Bridge ATOSHI from L2 back to L1. This may take 1-2 hours due to ZK proof verification.',
  privacyTxDesc: 'Funds will be moved using a nullifier circuit. No linking data will be visible to public explorers.',
  publicTxDesc: 'This is a public transaction. Details will be visible on-chain to anyone.',
};

// 获取浏览器语言
const getBrowserLanguage = () => {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: getBrowserLanguage(), // 默认使用浏览器语言
    fallbackLng: 'en', // 降级语言
    interpolation: {
      escapeValue: false, // React 已经默认转义
    },
  });

export default i18n;
