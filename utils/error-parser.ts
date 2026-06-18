/**
 * Transaction Error Parser - 将复杂的链上错误转换为友好的用户提示
 */

import { t } from 'i18next';

// 常见的以太坊/钱包错误代码
export const ERROR_CODES = {
  // MetaMask / Wallet errors
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  
  // RPC errors
  RPC_TIMEOUT: -32002,
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

// 错误类型枚举
export enum ErrorType {
  USER_REJECTED = 'USER_REJECTED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  ALREADY_SPENT = 'ALREADY_SPENT',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  WRONG_CHAIN = 'WRONG_CHAIN',
  UNKNOWN = 'UNKNOWN',
}

// 解析后的错误信息
export interface ParsedError {
  type: ErrorType;
  title: string;
  message: string;
  suggestion?: string;
  originalError?: any;
}

/**
 * 主函数:解析交易错误
 */
export function parseTransactionError(error: any): ParsedError {
  console.log('[Error Parser] Parsing error:', error);
  
  // 提取错误消息
  const errorMessage = extractErrorMessage(error);
  const errorCode = extractErrorCode(error);
  
  console.log('[Error Parser] Extracted message:', errorMessage);
  console.log('[Error Parser] Extracted code:', errorCode);
  
  // 按优先级检查各种错误类型
  
  // 0. 检查是否已经是友好的业务错误消息(直接返回)
  const friendlyMessage = detectFriendlyBusinessError(errorMessage);
  if (friendlyMessage) {
    return friendlyMessage;
  }
  
  // 1. 用户拒绝
  if (isUserRejected(errorMessage, errorCode)) {
    return {
      type: ErrorType.USER_REJECTED,
      title: t('error.userRejected.title', '操作已取消'),
      message: t('error.userRejected.message', '您在钱包中取消了此操作'),
      suggestion: t('error.userRejected.suggestion', '如需继续,请重新发起交易'),
      originalError: error,
    };
  }
  
  // 2. 余额不足
  if (isInsufficientBalance(errorMessage)) {
    return {
      type: ErrorType.INSUFFICIENT_BALANCE,
      title: t('error.insufficientBalance.title', '余额不足'),
      message: t('error.insufficientBalance.message', '您的账户余额不足以完成此交易'),
      suggestion: t('error.insufficientBalance.suggestion', '请确保账户有足够的代币和Gas费用'),
      originalError: error,
    };
  }
  
  // 3. Gas不足
  if (isInsufficientGas(errorMessage)) {
    return {
      type: ErrorType.INSUFFICIENT_GAS,
      title: t('error.insufficientGas.title', 'Gas费用不足'),
      message: t('error.insufficientGas.message', '当前设置的Gas费用不足以完成交易'),
      suggestion: t('error.insufficientGas.suggestion', '请在钱包中提高Gas限制或Gas价格'),
      originalError: error,
    };
  }
  
  // 4. 网络错误
  if (isNetworkError(errorMessage, errorCode)) {
    return {
      type: ErrorType.NETWORK_ERROR,
      title: t('error.network.title', '网络连接失败'),
      message: t('error.network.message', '无法连接到区块链网络'),
      suggestion: t('error.network.suggestion', '请检查网络连接后重试'),
      originalError: error,
    };
  }
  
  // 5. 无效地址
  if (isInvalidAddress(errorMessage)) {
    return {
      type: ErrorType.INVALID_ADDRESS,
      title: t('error.invalidAddress.title', '地址无效'),
      message: t('error.invalidAddress.message', '收款地址格式不正确'),
      suggestion: t('error.invalidAddress.suggestion', '请检查并输入正确的地址'),
      originalError: error,
    };
  }
  
  // 6. 无效金额
  if (isInvalidAmount(errorMessage)) {
    return {
      type: ErrorType.INVALID_AMOUNT,
      title: t('error.invalidAmount.title', '金额无效'),
      message: t('error.invalidAmount.message', '交易金额不符合要求'),
      suggestion: t('error.invalidAmount.suggestion', '请确保金额为正数且不超过可用余额'),
      originalError: error,
    };
  }
  
  // 7. Note已被花费(隐私交易特有)
  if (isAlreadySpent(errorMessage)) {
    return {
      type: ErrorType.ALREADY_SPENT,
      title: t('error.alreadySpent.title', 'Note已使用'),
      message: t('error.alreadySpent.message', '您选择的隐私Note已经被使用'),
      suggestion: t('error.alreadySpent.suggestion', '请点击"从链上恢复Note"同步最新状态'),
      originalError: error,
    };
  }
  
  // 8. 未初始化隐私功能
  if (isNotInitialized(errorMessage)) {
    return {
      type: ErrorType.NOT_INITIALIZED,
      title: t('error.notInitialized.title', '隐私功能未启用'),
      message: t('error.notInitialized.message', '您需要先初始化隐私功能'),
      suggestion: t('error.notInitialized.suggestion', '请点击"设置隐私"开始'),
      originalError: error,
    };
  }
  
  // 9. 错误的链
  if (isWrongChain(errorMessage)) {
    return {
      type: ErrorType.WRONG_CHAIN,
      title: t('error.wrongChain.title', '网络错误'),
      message: t('error.wrongChain.message', '当前不在Atoshi L2网络上'),
      suggestion: t('error.wrongChain.suggestion', '请切换到Atoshi L2网络后重试'),
      originalError: error,
    };
  }
  
  // 10. 合约调用异常(通用)
  if (isContractException(errorMessage)) {
    const contractError = parseContractException(errorMessage, error);
    if (contractError) {
      return contractError;
    }
  }
  
  // 默认:未知错误
  return {
    type: ErrorType.UNKNOWN,
    title: t('error.unknown.title', '交易失败'),
    message: t('error.unknown.message', '交易执行时发生错误'),
    suggestion: getSimplifiedErrorMessage(errorMessage),
    originalError: error,
  };
}

/**
 * 检测是否已经是友好的业务错误消息
 * 如果是,直接返回格式化的 ParsedError,避免重复包装
 */
function detectFriendlyBusinessError(message: string): ParsedError | null {
  if (!message || message.length < 10) return null;
  
  const lowerMessage = message.toLowerCase();
  
  // 模式1: "There are no Notes in the pool. Please Shield Funds X ATOSHI first..."
  if (lowerMessage.includes('there are no notes in the pool') || 
      lowerMessage.includes('no notes in the pool')) {
    
    // 提取金额(如果有)
    const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*ATOSHI/i);
    const amount = amountMatch ? amountMatch[1] : '';
    
    return {
      type: ErrorType.CONTRACT_ERROR,
      title: t('error.noNotesAvailable.title', '没有可用的 Note'),
      message: amount 
        ? t('error.noNotesAvailable.messageWithAmount', '隐私池中没有可用的 Note。请先屏蔽 {{amount}} ATOSHI', { amount })
        : t('error.noNotesAvailable.message', '隐私池中没有可用的 Note。请先进行屏蔽操作'),
      suggestion: t('error.noNotesAvailable.suggestion', '操作步骤:\n1. 在“公开”标签点击“屏蔽资金”\n2. 等待交易确认\n3. 点击“从链上恢复 Note”同步\n4. 再来尝试此操作'),
    };
  }
  
  // 模式2: "There is no Note with amount = X ATOSHI in the pool..."
  if (lowerMessage.includes('there is no note with amount') || 
      lowerMessage.includes('no note with amount')) {
    
    const amountMatch = message.match(/amount\s*=\s*(\d+(?:\.\d+)?)\s*ATOSHI/i);
    const amount = amountMatch ? amountMatch[1] : '';
    
    return {
      type: ErrorType.CONTRACT_ERROR,
      title: t('error.noMatchingNote.title', '没有匹配金额的 Note'),
      message: amount
        ? t('error.noMatchingNote.messageWithAmount', '隐私池中没有金额为 {{amount}} ATOSHI 的 Note', { amount })
        : t('error.noMatchingNote.message', '隐私池中没有匹配金额的 Note'),
      suggestion: t('error.noMatchingNote.suggestion', 'V1 版本不支持找零,Note 金额必须与转账金额完全一致。\n\n请:\n1. 查看可用的 Note 金额列表\n2. 使用匹配的金额进行交易\n3. 或先屏蔽所需金额的 Note'),
    };
  }
  
  // 模式3: "The Note has no confirmed leafIndex yet..."
  if (lowerMessage.includes('no confirmed leafindex') || 
      lowerMessage.includes('leafindex')) {
    
    return {
      type: ErrorType.CONTRACT_ERROR,
      title: t('error.noteNotSynced.title', 'Note 未同步'),
      message: t('error.noteNotSynced.message', 'Note 尚未与链上状态同步'),
      suggestion: t('error.noteNotSynced.suggestion', '请点击“从链上恢复 Note”按钮同步最新状态后再试'),
    };
  }
  
  // 模式4: 包含 "Please" 和明确的操作指导,且长度适中(20-300字符)
  if (lowerMessage.includes('please') && 
      message.length >= 20 && 
      message.length <= 500 &&
      !lowerMessage.includes('error:') &&
      !lowerMessage.includes('exception') &&
      !lowerMessage.includes('revert')) {
    
    // 这很可能是一个已经友好的业务错误消息
    // 提取第一行作为标题,其余作为消息和建议
    const lines = message.split('\n').filter(line => line.trim());
    const title = lines[0].substring(0, 50);
    const restMessage = lines.slice(1).join('\n');
    
    return {
      type: ErrorType.CONTRACT_ERROR,
      title: title,
      message: restMessage || title,
      suggestion: undefined, // 消息本身已包含建议
    };
  }
  
  // 模式5: 包含明确的格式说明或警告(如 "Expected format", "will cause")
  if ((lowerMessage.includes('expected format') || 
       lowerMessage.includes('use the') || 
       lowerMessage.includes('not a') ||
       lowerMessage.includes('will cause')) &&
      message.length >= 30 &&
      message.length <= 500) {
    
    // 这通常是参数验证错误的友好提示
    // 直接返回简洁的i18n翻译,不显示原始冗长消息
    return {
      type: ErrorType.INVALID_ADDRESS,
      title: t('error.invalidReceivingCode.title', '接收码无效'),
      message: t('error.invalidReceivingCode.message', '隐私接收码格式不正确'),
      suggestion: t('error.invalidReceivingCode.suggestion', '请使用对方通过"设置隐私"生成的JSON格式接收码'),
    };
  }
  
  return null;
}

/**
 * 提取错误消息字符串
 */
function extractErrorMessage(error: any): string {
  if (!error) return '';
  
  // 优先使用reason字段
  if (error.reason && typeof error.reason === 'string') {
    return error.reason;
  }
  
  // 使用message字段
  if (error.message && typeof error.message === 'string') {
    return error.message;
  }
  
  // 使用data字段
  if (error.data && typeof error.data === 'string') {
    return error.data;
  }
  
  // 尝试从shortMessage获取
  if (error.shortMessage && typeof error.shortMessage === 'string') {
    return error.shortMessage;
  }
  
  // 最后尝试整个对象转字符串
  return String(error);
}

/**
 * 提取错误代码
 */
function extractErrorCode(error: any): number | null {
  if (!error) return null;
  
  // ethers.js v6 错误结构
  if (error.code && typeof error.code === 'number') {
    return error.code;
  }
  
  // MetaMask / EIP-1193 错误结构
  if (error.error && error.error.code) {
    return error.error.code;
  }
  
  // viem/wagmi 错误结构
  if (error.cause && error.cause.code) {
    return error.cause.code;
  }
  
  return null;
}

/**
 * 判断是否为用户拒绝
 */
function isUserRejected(message: string, code: number | null): boolean {
  const patterns = [
    'user rejected',
    'user rejected the request',
    'rejected by user',
    'user denied',
    'user canceled',
    'user cancelled',
    'ACTION_REJECTED',
    'Request rejected',
  ];
  
  const lowerMessage = message.toLowerCase();
  return code === ERROR_CODES.USER_REJECTED || 
         patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为余额不足
 */
function isInsufficientBalance(message: string): boolean {
  const patterns = [
    'insufficient funds',
    'insufficient balance',
    'balance too low',
    'not enough balance',
    'exceeds balance',
    'transfer amount exceeds balance',
    'ERC20: transfer amount exceeds balance',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为Gas不足
 */
function isInsufficientGas(message: string): boolean {
  const patterns = [
    'out of gas',
    'gas required exceeds allowance',
    'always failing transaction',
    'execution reverted',
    'gas limit exceeded',
    'intrinsic gas too low',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(message: string, code: number | null): boolean {
  const patterns = [
    'network error',
    'connection timeout',
    'connection refused',
    'request failed',
    'fetch failed',
    'socket hang up',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'signal is aborted',
    'abort without reason',
  ];
  
  const lowerMessage = message.toLowerCase();
  return code === ERROR_CODES.RPC_TIMEOUT ||
         patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为无效地址
 */
function isInvalidAddress(message: string): boolean {
  const patterns = [
    'invalid address',
    'bad address',
    'address is not valid',
    'checksum address mismatch',
    'invalid recipient',
    'Shield: invalid recipient',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为无效金额
 */
function isInvalidAmount(message: string): boolean {
  const patterns = [
    'invalid amount',
    'amount must be positive',
    'amount exceeds',
    'zero amount',
    'amount too small',
    'underflow',
    'overflow',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为Note已被花费
 */
function isAlreadySpent(message: string): boolean {
  const patterns = [
    'already spent',
    'note already used',
    'nullifier already revealed',
    'Shield: already spent',
    'double spend',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为未初始化
 */
function isNotInitialized(message: string): boolean {
  const patterns = [
    'not initialized',
    'privacy keys not set',
    'please initialize',
    'setup privacy first',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为错误的链
 */
function isWrongChain(message: string): boolean {
  const patterns = [
    'wrong chain',
    'incorrect network',
    'chain id mismatch',
    'not on atoshi',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 判断是否为合约异常
 */
function isContractException(message: string): boolean {
  const patterns = [
    'call exception',
    'CALL_EXCEPTION',
    'execution reverted',
    'revert',
    'missing revert data',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 解析合约调用异常的具体原因
 */
function parseContractException(message: string, originalError?: any): ParsedError | null {
  const lowerMessage = message.toLowerCase();
  
  // 检查具体的合约错误
  if (lowerMessage.includes('shield: already spent')) {
    return {
      type: ErrorType.ALREADY_SPENT,
      title: t('error.alreadySpent.title', 'Note已使用'),
      message: t('error.alreadySpent.message', '您选择的隐私Note已经被使用'),
      suggestion: t('error.alreadySpent.suggestion', '请点击"从链上恢复Note"同步最新状态'),
    };
  }
  
  if (lowerMessage.includes('shield: invalid recipient') || 
      lowerMessage.includes('invalid recipient')) {
    return {
      type: ErrorType.INVALID_ADDRESS,
      title: t('error.invalidAddress.title', '地址无效'),
      message: t('error.invalidAddress.message', '收款地址格式不正确'),
      suggestion: t('error.invalidAddress.suggestion', '请检查并输入正确的地址'),
    };
  }
  
  if (lowerMessage.includes('transfer amount exceeds balance') ||
      lowerMessage.includes('insufficient funds')) {
    return {
      type: ErrorType.INSUFFICIENT_BALANCE,
      title: t('error.insufficientBalance.title', '余额不足'),
      message: t('error.insufficientBalance.message', '您的账户余额不足以完成此交易'),
      suggestion: t('error.insufficientBalance.suggestion', '请确保账户有足够的代币和Gas费用'),
    };
  }
  
  // 特殊处理: missing revert data (没有具体错误信息的合约调用失败)
  if (lowerMessage.includes('missing revert data') || 
      (lowerMessage.includes('call_exception') && 
       lowerMessage.includes('data=null') && 
       lowerMessage.includes('reason=null'))) {
    
    // 尝试从交易数据中推断可能的原因
    const inferredError = inferMissingRevertDataError(originalError);
    if (inferredError) {
      return inferredError;
    }
    
    // 如果无法推断,返回通用的合约执行失败提示
    return {
      type: ErrorType.CONTRACT_ERROR,
      title: t('error.contractExecutionFailed.title', '合约执行失败'),
      message: t('error.contractExecutionFailed.message', '交易在合约层面执行失败,但未返回具体错误信息'),
      suggestion: t('error.contractExecutionFailed.suggestion', '可能原因:\n1. 余额不足\n2. 未授权操作\n3. 合约条件不满足\n\n请检查账户余额和交易参数后重试'),
    };
  }
  
  return null;
}

/**
 * 当合约返回 missing revert data 时,尝试从交易数据推断可能的错误原因
 */
function inferMissingRevertDataError(originalError?: any): ParsedError | null {
  if (!originalError) return null;
  
  // 尝试从 transaction 字段获取更多信息
  const tx = originalError.transaction;
  if (!tx) return null;
  
  console.log('[Error Parser] Attempting to infer error from transaction data:', tx);
  
  // 检查是否有 value 字段(ETH转账)
  if (tx.value) {
    try {
      const valueWei = BigInt(tx.value);
      if (valueWei > 0n) {
        // 有ETH转账,可能是余额不足
        return {
          type: ErrorType.INSUFFICIENT_BALANCE,
          title: t('error.insufficientBalance.title', '余额不足'),
          message: t('error.insufficientBalance.message', '您的账户余额不足以完成此交易'),
          suggestion: t('error.insufficientBalance.suggestion', '请确保账户有足够的代币和Gas费用'),
        };
      }
    } catch (e) {
      // 忽略解析错误
    }
  }
  
  // 检查 action 字段
  if (originalError.action === 'estimateGas') {
    // estimateGas 失败通常意味着交易会revert
    // 最常见的原因是余额不足或条件不满足
    return {
      type: ErrorType.CONTRACT_ERROR,
      title: t('error.estimateGasFailed.title', 'Gas估算失败'),
      message: t('error.estimateGasFailed.message', '无法估算交易所需的Gas,交易可能会失败'),
      suggestion: t('error.estimateGasFailed.suggestion', '可能原因:\n1. 余额不足\n2. 合约条件不满足\n3. 参数错误\n\n请检查交易参数和账户余额后重试'),
    };
  }
  
  return null;
}

/**
 * 获取简化的错误消息(用于未知错误)
 */
function getSimplifiedErrorMessage(message: string): string {
  if (!message || message.length < 10) {
    return t('error.unknown.suggestion', '请稍后重试');
  }
  
  // 如果消息太长,截取前100个字符
  const simplified = message.length > 100 ? message.substring(0, 100) + '...' : message;
  
  // 移除技术细节(如交易哈希、字节码等)
  const cleaned = simplified
    .replace(/0x[a-fA-F0-9]{64}/g, '[hash]')  // 移除哈希
    .replace(/0x[a-fA-F0-9]+/g, '[data]')       // 移除十六进制数据
    .replace(/\{[^}]*\}/g, '[data]');            // 移除JSON对象
  
  return cleaned;
}

/**
 * 格式化错误用于显示(Toast)
 */
export function formatErrorForDisplay(error: any): string {
  const parsed = parseTransactionError(error);
  
  // 组合标题和消息
  let displayText = `${parsed.title}\n${parsed.message}`;
  
  // 如果有建议,也加上
  if (parsed.suggestion) {
    displayText += `\n\n${parsed.suggestion}`;
  }
  
  return displayText;
}
