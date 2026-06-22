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
  welcomeTitle: '欢迎来到 Atos Privacy',
  welcomeSubtitle: '连接您的钱包以访问隐私功能',
  notOnAtoshiL2: '⚠️ 当前不在 Atos L2 链上',
  currentChain: '当前链',
  needSwitchToL2: '需要切换到 Atos L2 (链',
  addNetworkTip: '💡 如果 MetaMask 从未添加过 Atos L2,点击下方按钮将自动添加',
  addAndSwitch: '➕ 添加并切换到 Atos L2',
  switch: '切换',
  failedToAdd: '添加失败',
  scanComplete: '扫描完成,已恢复',
  note: '个 Note',
  recoveryFailed: '恢复失败',
  scanningNotes: '⏳ 正在扫描链上 Notes...',
  recoverNotesFromChain: '🔄 从链上恢复 Notes',
  pleaseConnectFirst: '请先连接钱包!',
  initializePrivacyFirst: '请先初始化您的隐私身份(点击"设置隐私")',
  connectAndSwitchL2: '请先连接钱包并切换到 Atos L2 链(链 67890)',
  transactionSuccess: '交易成功',
  transactionFailed: '交易失败',
  userRefusedOperation: '用户拒绝了操作',
  unknownError: '未知错误',
  refreshBalance: '刷新余额',
  refreshing: '刷新中...',
  balanceRefreshed: '余额已刷新',
  refreshFailed: '刷新失败',

  // Error Messages
  error: {
    userRejected: {
      title: '操作已取消',
      message: '您在钱包中取消了此操作',
      suggestion: '如需继续,请重新发起交易',
    },
    insufficientBalance: {
      title: '余额不足',
      message: '您的账户余额不足以完成此交易',
      suggestion: '请确保账户有足够的代币和Gas费用',
    },
    insufficientGas: {
      title: 'Gas费用不足',
      message: '当前设置的Gas费用不足以完成交易',
      suggestion: '请在钱包中提高Gas限制或Gas价格',
    },
    network: {
      title: '网络连接失败',
      message: '无法连接到区块链网络',
      suggestion: '请检查网络连接后重试',
    },
    invalidAddress: {
      title: '地址无效',
      message: '收款地址格式不正确',
      suggestion: '请检查并输入正确的地址',
    },
    invalidAmount: {
      title: '金额无效',
      message: '交易金额不符合要求',
      suggestion: '请确保金额为正数且不超过可用余额',
    },
    alreadySpent: {
      title: 'Note已使用',
      message: '您选择的隐私Note已经被使用',
      suggestion: '请点击"从链上恢复Note"同步最新状态',
    },
    notInitialized: {
      title: '隐私功能未启用',
      message: '您需要先初始化隐私功能',
      suggestion: '请点击"设置隐私"开始',
    },
    wrongChain: {
      title: '网络错误',
      message: '当前不在Atos L2网络上',
      suggestion: '请切换到Atos L2网络后重试',
    },
    contractExecutionFailed: {
      title: '合约执行失败',
      message: '交易在合约层面执行失败,但未返回具体错误信息',
      suggestion: '可能原因:\n1. 余额不足\n2. 未授权操作\n3. 合约条件不满足\n\n请检查账户余额和交易参数后重试',
    },
    estimateGasFailed: {
      title: 'Gas估算失败',
      message: '无法估算交易所需的Gas,交易可能会失败',
      suggestion: '可能原因:\n1. 余额不足\n2. 合约条件不满足\n3. 参数错误\n\n请检查交易参数和账户余额后重试',
    },
    noNotesAvailable: {
      title: '没有可用的 Note',
      message: '隐私池中没有可用的 Note。请先进行屏蔽操作',
      messageWithAmount: '隐私池中没有可用的 Note。请先屏蔽 {{amount}} ATOS',
      suggestion: '操作步骤:\n1. 在“公开”标签点击“屏蔽资金”\n2. 等待交易确认\n3. 点击“从链上恢复 Note”同步\n4. 再来尝试此操作',
    },
    noMatchingNote: {
      title: '没有匹配金额的 Note',
      message: '隐私池中没有匹配金额的 Note',
      messageWithAmount: '隐私池中没有金额为 {{amount}} ATOS 的 Note',
      suggestion: 'V1 版本不支持找零,Note 金额必须与转账金额完全一致。\n\n请:\n1. 查看可用的 Note 金额列表\n2. 使用匹配的金额进行交易\n3. 或先屏蔽所需金额的 Note',
    },
    noteNotSynced: {
      title: 'Note 未同步',
      message: 'Note 尚未与链上状态同步',
      suggestion: '请点击“从链上恢复 Note”按钮同步最新状态后再试',
    },
    invalidReceivingCode: {
      title: '接收码无效',
      message: '隐私接收码格式不正确',
      suggestion: '请使用对方通过“设置隐私”生成的JSON格式接收码',
    },
    unknown: {
      title: '交易失败',
      message: '交易执行时发生错误',
      suggestion: '请稍后重试',
    },
  },

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
  eip712Signature: 'EIP-712 签名 (Atos v1)',
  privacySeed: '隐私种子 (Poseidon 输出)',

  // PublicDashboard.tsx
  publicBalance: '公开余额',
  depositFromWallet: '从钱包充值',
  withdrawToWallet: '提现到钱包',
  sendATOSHI: '发送 ATOS',
  shieldFunds: '屏蔽资金',
  recentPublicTxs: '最近公开交易',
  noTransactionHistory: '暂无交易历史',
  startYourFirstTx: '开始您的第一笔交易吧！',

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
  receivingCodeCopied: '收款信息已复制',
  privacyNoteList: '隐私 Note 列表(本地)',
  available: '可用',
  total: '总计',
  noNotesYet: '还没有 Note。进行一笔屏蔽交易,或点击"🔄 从链上恢复 NOTE"来同步。',
  spent: '已花费',
  pendingSync: '等待同步',
  sessionTransactions: '本次会话的交易记录',
  noTransactionHistory: '暂无交易历史',
  startYourFirstTx: '开始您的第一笔交易吧！',

  // ActionModal.tsx
  sendATOSHITitle: '发送 ATOS',
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
  invalidAddressFormat: '地址格式错误',
  pasteOrScan: '粘贴接收方的接收码或点击右侧扫描 →',
  scanQRCode: '扫描接收方的二维码',
  depositTo: '充值到',
  withdrawTo: '提现到',
  yourL2Address: '您的 L2 钱包地址',
  yourL1Address: '您的 L1 钱包地址',
  yourPrivacyPool: '您自己的隐私池(不需要接收方地址)',
  generatingZKProof: '本地生成 ZK 证明',
  transferForPrivacy: '将 ATOS 从您的钱包转移到 L2 以进行隐私交易。',
  bridgeWithdrawDesc: '将 ATOS 从 L2 桥接回 L1。由于 ZK 证明验证,这可能需要 1-2 小时。',
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
  welcomeTitle: 'Welcome to Atos Privacy',
  welcomeSubtitle: 'Connect your wallet to access privacy features',
  notOnAtoshiL2: '⚠️ Not currently on the Atos L2 chain',
  currentChain: 'Current chain',
  needSwitchToL2: 'need to switch to Atos L2 (chain',
  addNetworkTip: '💡 If MetaMask has never added Atos L2, clicking the button below will add it automatically.',
  addAndSwitch: '➕ Add and switch to Atos L2',
  switch: 'Switch',
  failedToAdd: 'Failed to add',
  scanComplete: 'Scan complete, recovered',
  note: 'Note(s)',
  recoveryFailed: 'Recovery failed',
  scanningNotes: '⏳ Scanning Notes on chain...',
  recoverNotesFromChain: '🔄 Recover Notes from chain',
  pleaseConnectFirst: 'Please connect your wallet first!',
  initializePrivacyFirst: 'Please initialize your privacy identity first (click "Setup Privacy")',
  connectAndSwitchL2: 'Please connect your wallet first and switch to the Atos L2 chain (chain 67890)',
  transactionSuccess: 'Transaction successful',
  transactionFailed: 'Transaction failed',
  userRefusedOperation: 'User refused the operation',
  unknownError: 'Unknown error',
  refreshBalance: 'Refresh Balance',
  refreshing: 'Refreshing...',
  balanceRefreshed: 'Balance refreshed',
  refreshFailed: 'Refresh failed',

  // Error Messages
  error: {
    userRejected: {
      title: 'Operation Cancelled',
      message: 'You cancelled this operation in your wallet',
      suggestion: 'To continue, please initiate the transaction again',
    },
    insufficientBalance: {
      title: 'Insufficient Balance',
      message: 'Your account balance is insufficient for this transaction',
      suggestion: 'Please ensure you have enough tokens and gas fees',
    },
    insufficientGas: {
      title: 'Insufficient Gas',
      message: 'The current gas setting is insufficient to complete the transaction',
      suggestion: 'Please increase the gas limit or gas price in your wallet',
    },
    network: {
      title: 'Network Connection Failed',
      message: 'Unable to connect to the blockchain network',
      suggestion: 'Please check your connection and try again',
    },
    invalidAddress: {
      title: 'Invalid Address',
      message: 'The recipient address format is incorrect',
      suggestion: 'Please check and enter the correct address',
    },
    invalidAmount: {
      title: 'Invalid Amount',
      message: 'The transaction amount does not meet requirements',
      suggestion: 'Please ensure the amount is positive and does not exceed available balance',
    },
    alreadySpent: {
      title: 'Note Already Used',
      message: 'The privacy note you selected has already been used',
      suggestion: 'Please click "Recover Notes from chain" to sync the latest status',
    },
    notInitialized: {
      title: 'Privacy Not Enabled',
      message: 'You need to initialize privacy features first',
      suggestion: 'Please click "Setup Privacy" to get started',
    },
    wrongChain: {
      title: 'Network Error',
      message: 'Not currently on Atos L2 network',
      suggestion: 'Please switch to Atos L2 network and try again',
    },
    contractExecutionFailed: {
      title: 'Contract Execution Failed',
      message: 'Transaction failed at contract level without specific error details',
      suggestion: 'Possible reasons:\n1. Insufficient balance\n2. Unauthorized operation\n3. Contract conditions not met\n\nPlease check your balance and transaction parameters',
    },
    estimateGasFailed: {
      title: 'Gas Estimation Failed',
      message: 'Unable to estimate gas required for transaction',
      suggestion: 'Possible reasons:\n1. Insufficient balance\n2. Contract conditions not met\n3. Invalid parameters\n\nPlease check transaction parameters and account balance',
    },
    noNotesAvailable: {
      title: 'No Notes Available',
      message: 'No notes available in the privacy pool. Please shield funds first',
      messageWithAmount: 'No notes available. Please shield {{amount}} ATOS first',
      suggestion: 'Steps:\n1. Click "Shield Funds" in Public tab\n2. Wait for transaction confirmation\n3. Click "Recover Notes from chain" to sync\n4. Try this operation again',
    },
    noMatchingNote: {
      title: 'No Matching Note Amount',
      message: 'No note with matching amount in the privacy pool',
      messageWithAmount: 'No note with amount {{amount}} ATOS in the pool',
      suggestion: 'V1 does not support change. Note amount must exactly match transfer amount.\n\nPlease:\n1. Check available note amounts\n2. Use matching amount for transaction\n3. Or shield the required amount first',
    },
    noteNotSynced: {
      title: 'Note Not Synced',
      message: 'Note has not been synced with on-chain state',
      suggestion: 'Please click "Recover Notes from chain" to sync latest status before retrying',
    },
    invalidReceivingCode: {
      title: 'Invalid Receiving Code',
      message: 'Privacy receiving code format is incorrect',
      suggestion: 'Please use the JSON format receiving code generated via "Setup Privacy"',
    },
    unknown: {
      title: 'Transaction Failed',
      message: 'An error occurred during transaction execution',
      suggestion: 'Please try again later',
    },
  },

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
  eip712Signature: 'EIP-712 Signature (Atos v1)',
  privacySeed: 'Privacy Seed (Poseidon Output)',

  // PublicDashboard.tsx
  publicBalance: 'Public Balance',
  depositFromWallet: 'Deposit from Wallet',
  withdrawToWallet: 'Withdraw to Wallet',
  sendATOSHI: 'Send ATOS',
  shieldFunds: 'Shield Funds',
  recentPublicTxs: 'Recent Public Txs',
  noTransactionHistory: 'No transaction history yet',
  startYourFirstTx: 'Start your first transaction!',

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
  receivingCodeCopied: 'Receiving information copied',
  privacyNoteList: 'Privacy Note List (Local)',
  available: 'Available',
  total: 'Total',
  noNotesYet: 'No Notes yet. Shield a transaction, or click "🔄 Recover NOTE from chain" to sync.',
  spent: 'Spent',
  pendingSync: 'Pending Sync',
  sessionTransactions: "This Session's Transaction Records",
  noTransactionHistory: 'No transaction history yet',
  startYourFirstTx: 'Start your first transaction!',

  // ActionModal.tsx
  sendATOSHITitle: 'Send ATOS',
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
  invalidAddressFormat: 'The address format is incorrect',
  pasteOrScan: "Paste the recipient's receiving code or tap scan on the right →",
  scanQRCode: "Scan the recipient's QR code",
  depositTo: 'Deposit to',
  withdrawTo: 'Withdraw to',
  yourL2Address: 'Your L2 wallet address',
  yourL1Address: 'Your L1 wallet address',
  yourPrivacyPool: 'Your own privacy pool (no recipient address required)',
  generatingZKProof: 'Generating ZK-Proof locally',
  transferForPrivacy: 'Transfer ATOS from your wallet to L2 for privacy transactions.',
  bridgeWithdrawDesc: 'Bridge ATOS from L2 back to L1. This may take 1-2 hours due to ZK proof verification.',
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
