/**
 * Error Parser Test - 演示如何使用错误解析器
 * 
 * 这个文件展示了各种常见的链上错误如何被解析为友好的用户提示
 */

import { parseTransactionError, formatErrorForDisplay, ErrorType } from './error-parser';

// 示例1: MetaMask 用户拒绝错误
const userRejectedError = {
  code: 4001,
  message: 'User rejected the request',
};

console.log('=== 示例1: 用户拒绝 ===');
console.log(parseTransactionError(userRejectedError));
console.log(formatErrorForDisplay(userRejectedError));

// 示例2: 余额不足错误
const insufficientBalanceError = {
  reason: 'execution reverted',
  message: 'ERC20: transfer amount exceeds balance',
  code: 'CALL_EXCEPTION',
};

console.log('\n=== 示例2: 余额不足 ===');
console.log(parseTransactionError(insufficientBalanceError));
console.log(formatErrorForDisplay(insufficientBalanceError));

// 示例3: 网络超时错误
const networkError = {
  code: -32002,
  message: 'signal is aborted without reason',
};

console.log('\n=== 示例3: 网络错误 ===');
console.log(parseTransactionError(networkError));
console.log(formatErrorForDisplay(networkError));

// 示例4: 复杂的合约调用异常(您提供的例子)
const complexContractError = {
  action: 'estimateGas',
  data: null,
  reason: null,
  transaction: {
    data: '0xcd586579000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002675cf3e922824ae1b53a525907a0ac38b30b19000000000000000000000000000000000000000000000bc3a4806cfeba2c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000',
    from: '0x02675Cf3e922824ae1B53a525907A0Ac38B30b19',
    to: '0x0101481FA81E3044934CD905d322f4F5f116cc55'
  },
  invocation: null,
  revert: null,
  code: 'CALL_EXCEPTION',
  version: '6.16.0',
  message: 'missing revert data (action="estimateGas", data=null, reason=null, transaction={ "data": "0xcd586579...", "from": "0x02675Cf3e922824ae1B53a525907A0Ac38B30b19", "to": "0x0101481FA81E3044934CD905d322f4F5f116cc55" }, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.16.0)',
};

console.log('\n=== 示例4: 复杂合约异常 ===');
const parsed = parseTransactionError(complexContractError);
console.log('Parsed Error:', parsed);
console.log('\nFormatted for Display:');
console.log(formatErrorForDisplay(complexContractError));

// 示例5: Gas不足错误
const gasError = {
  reason: 'out of gas',
  message: 'gas required exceeds allowance',
  code: 'UNPREDICTABLE_GAS_LIMIT',
};

console.log('\n=== 示例5: Gas不足 ===');
console.log(parseTransactionError(gasError));
console.log(formatErrorForDisplay(gasError));

// 示例6: Note已被花费(隐私交易特有)
const alreadySpentError = {
  reason: 'Shield: already spent',
  message: 'execution reverted: Shield: already spent',
  code: 'CALL_EXCEPTION',
};

console.log('\n=== 示例6: Note已使用 ===');
console.log(parseTransactionError(alreadySpentError));
console.log(formatErrorForDisplay(alreadySpentError));

// 示例7: 无效地址
const invalidAddressError = {
  reason: 'Shield: invalid recipient',
  message: 'execution reverted: Shield: invalid recipient',
  code: 'CALL_EXCEPTION',
};

console.log('\n=== 示例7: 无效地址 ===');
console.log(parseTransactionError(invalidAddressError));
console.log(formatErrorForDisplay(invalidAddressError));

// 示例8: ethers.js v6 错误格式
const ethersV6Error = {
  code: 'CALL_EXCEPTION',
  shortMessage: 'execution reverted',
  data: '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001b45524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e6365',
  reason: 'ERC20: transfer amount exceeds balance',
};

console.log('\n=== 示例8: ethers.js v6 错误 ===');
console.log(parseTransactionError(ethersV6Error));
console.log(formatErrorForDisplay(ethersV6Error));

// 示例9: viem/wagmi 错误格式
const viemError = {
  cause: {
    code: 4001,
    message: 'User rejected the request',
  },
  message: 'User rejected the request.',
};

console.log('\n=== 示例9: viem/wagmi 错误 ===');
console.log(parseTransactionError(viemError));
console.log(formatErrorForDisplay(viemError));

// 示例10: RPC连接失败
const rpcError = {
  code: 'NETWORK_ERROR',
  message: 'could not detect network (event="noNetwork", code=NETWORK_ERROR, version=providers/5.7.2)',
};

console.log('\n=== 示例10: RPC连接失败 ===');
console.log(parseTransactionError(rpcError));
console.log(formatErrorForDisplay(rpcError));

console.log('\n=== 使用说明 ===');
console.log(`
在您的代码中使用错误解析器:

1. 导入函数:
   import { formatErrorForDisplay } from './utils/error-parser';

2. 在 catch 块中使用:
   try {
     await someTransaction();
   } catch (error) {
     const displayMessage = formatErrorForDisplay(error);
     showToast(displayMessage);
   }

3. 如果需要更详细的控制:
   try {
     await someTransaction();
   } catch (error) {
     const parsed = parseTransactionError(error);
     
     // 根据错误类型执行不同逻辑
     if (parsed.type === ErrorType.USER_REJECTED) {
       // 用户拒绝,不显示错误
       return;
     }
     
     // 显示友好的错误消息
     showToast(\`\${parsed.title}\\n\${parsed.message}\`);
   }
`);
