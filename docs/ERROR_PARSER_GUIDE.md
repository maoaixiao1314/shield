# 交易错误解析器使用指南

## 📖 概述

`error-parser.ts` 是一个专门用于将复杂的链上错误转换为友好的用户提示的工具。它支持多种钱包(MetaMask、WalletConnect等)和多种错误库(ethers.js v5/v6、viem/wagmi)的错误格式。

## ✨ 功能特性

### 支持的错误类型

1. **用户拒绝** - 用户在钱包中取消操作
2. **余额不足** - 账户余额不足以完成交易
3. **Gas不足** - Gas设置过低
4. **网络错误** - RPC连接失败或超时
5. **无效地址** - 收款地址格式不正确
6. **无效金额** - 交易金额不符合要求
7. **Note已使用** - 隐私Note已被花费(隐私交易特有)
8. **未初始化** - 隐私功能未启用
9. **错误的链** - 当前不在正确的网络上
10. **合约异常** - 各种合约调用失败

### 多语言支持

错误消息已集成到 i18n 系统中,支持中文和英文自动切换。

## 🚀 快速开始

### 1. 基本用法

```typescript
import { formatErrorForDisplay } from './utils/error-parser';

try {
  await someTransaction();
} catch (error) {
  const displayMessage = formatErrorForDisplay(error);
  showToast(displayMessage);
}
```

### 2. 高级用法(需要更详细的控制)

```typescript
import { parseTransactionError, ErrorType } from './utils/error-parser';

try {
  await someTransaction();
} catch (error) {
  const parsed = parseTransactionError(error);
  
  // 根据错误类型执行不同逻辑
  switch (parsed.type) {
    case ErrorType.USER_REJECTED:
      // 用户拒绝,不显示错误或显示轻量提示
      console.log('用户取消了操作');
      return;
      
    case ErrorType.INSUFFICIENT_BALANCE:
      // 余额不足,可以引导用户充值
      showRechargeModal();
      break;
      
    case ErrorType.ALREADY_SPENT:
      // Note已使用,触发恢复流程
      await recoverNotesFromChain();
      break;
      
    default:
      // 其他错误,显示友好提示
      showToast(`${parsed.title}\n${parsed.message}`);
  }
}
```

### 3. 在 App.tsx 中的实际应用

已经集成在 `App.tsx` 的 `onConfirmAction` 函数中:

```typescript
const onConfirmAction = async (amount: string, to: string) => {
  try {
    let tx: Transaction;
    
    switch (activeAction) {
      case TransactionType.TRANSFER:
        tx = await transfer(amount, to);
        break;
      // ... 其他交易类型
    }
    
    // 成功处理...
    setToastMessage(t('transactionSuccess'));
    setShowToast(true);
    
  } catch (error) {
    console.error('Transaction failed:', error);
    
    // 使用友好的错误解析器
    const displayMessage = formatErrorForDisplay(error);
    
    setToastMessage(displayMessage);
    setShowToast(true);
  }
};
```

## 📊 示例对比

### ❌ 之前的错误提示

```
Transaction failed: Error: missing revert data (action="estimateGas", 
data=null, reason=null, transaction={ "data": "0xcd586579...", 
"from": "0x02675Cf3e922824ae1B53a525907A0Ac38B30b19", 
"to": "0x0101481FA81E3044934CD905d322f4F5f116cc55" }, 
invocation=null, revert=null, code=CALL_EXCEPTION, version=6.16.0)
```

### ✅ 现在的错误提示

**中文:**
```
交易失败
交易执行时发生错误

请稍后重试
```

**英文:**
```
Transaction Failed
An error occurred during transaction execution

Please try again later
```

### 具体错误示例

#### 用户拒绝
```
操作已取消
您在钱包中取消了此操作

如需继续,请重新发起交易
```

#### 余额不足
```
余额不足
您的账户余额不足以完成此交易

请确保账户有足够的代币和Gas费用
```

#### Note已使用(隐私交易)
```
Note已使用
您选择的隐私Note已经被使用

请点击"从链上恢复Note"同步最新状态
```

## 🔧 扩展错误类型

如果需要添加新的错误类型,请按以下步骤操作:

### 1. 在 `error-parser.ts` 中添加错误检测

```typescript
// 在 ErrorType 枚举中添加新类型
export enum ErrorType {
  // ... 现有类型
  YOUR_NEW_ERROR = 'YOUR_NEW_ERROR',
}

// 添加检测函数
function isYourNewError(message: string): boolean {
  const patterns = [
    'your error pattern 1',
    'your error pattern 2',
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

// 在 parseTransactionError 函数中添加判断
if (isYourNewError(errorMessage)) {
  return {
    type: ErrorType.YOUR_NEW_ERROR,
    title: t('error.yourNewError.title', '错误标题'),
    message: t('error.yourNewError.message', '错误描述'),
    suggestion: t('error.yourNewError.suggestion', '解决建议'),
    originalError: error,
  };
}
```

### 2. 在 `i18n.ts` 中添加翻译

```typescript
// 中文
zh: {
  error: {
    // ... 现有错误
    yourNewError: {
      title: '错误标题',
      message: '错误描述',
      suggestion: '解决建议',
    },
  },
}

// 英文
en: {
  error: {
    // ... 现有错误
    yourNewError: {
      title: 'Error Title',
      message: 'Error description',
      suggestion: 'Solution suggestion',
    },
  },
}
```

## 🎯 最佳实践

### 1. 始终使用错误解析器

不要在代码中硬编码错误检查逻辑,统一使用 `formatErrorForDisplay`:

```typescript
// ❌ 不好的做法
if (error.message.includes('user rejected')) {
  showToast('用户拒绝了操作');
} else if (error.message.includes('insufficient funds')) {
  showToast('余额不足');
}

// ✅ 好的做法
const displayMessage = formatErrorForDisplay(error);
showToast(displayMessage);
```

### 2. 保留原始错误日志

在生产环境中,仍然应该记录完整的错误信息以便调试:

```typescript
catch (error) {
  // 记录完整错误(用于调试)
  console.error('Transaction failed:', error);
  
  // 显示友好消息(给用户看)
  const displayMessage = formatErrorForDisplay(error);
  showToast(displayMessage);
}
```

### 3. 特殊处理用户拒绝

用户拒绝是正常操作,不应该显示为错误:

```typescript
catch (error) {
  const parsed = parseTransactionError(error);
  
  if (parsed.type === ErrorType.USER_REJECTED) {
    // 不显示Toast,或者显示轻量提示
    console.log('User cancelled');
    return;
  }
  
  // 其他错误正常显示
  showToast(formatErrorForDisplay(error));
}
```

## 🧪 测试

运行测试文件查看各种错误的解析结果:

```bash
# 查看测试示例
cat utils/error-parser.test.ts

# 或在浏览器控制台中测试
import { parseTransactionError } from './utils/error-parser';

const testError = { code: 4001, message: 'User rejected the request' };
console.log(parseTransactionError(testError));
```

## 📝 注意事项

1. **错误优先级**: 解析器按优先级检查错误类型,第一个匹配的类型会被返回
2. **未知错误**: 如果无法识别错误类型,会返回通用的"交易失败"消息
3. **多语言**: 确保在 i18n 中添加了所有错误类型的翻译
4. **向后兼容**: 现有的错误处理代码仍然有效,可以逐步迁移到新的解析器

## 🔗 相关文件

- `/utils/error-parser.ts` - 错误解析器主文件
- `/i18n.ts` - 国际化翻译配置
- `/App.tsx` - 主要集成位置
- `/utils/error-parser.test.ts` - 测试示例
