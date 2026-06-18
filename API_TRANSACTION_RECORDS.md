# 交易记录查询 API 文档

## 概述

本接口用于从链上查询用户的交易历史记录，替代当前前端本地存储的方式。支持查询公开交易和隐私交易（通过 viewingKey 解密）。

---

## 基础信息

- **Base URL**: `https://your-api-domain.com/api`
- **Content-Type**: `application/json`
- **认证方式**: 无需认证（公开数据）或通过 wallet address 查询

---

## 数据结构定义

### Transaction 对象

```typescript
interface Transaction {
  id: string;              // 唯一标识符（通常为 txHash 或 nullifierHash）
  type: TransactionType;   // 交易类型
  amount: string;          // 金额（ETH格式，如 "1.23456789"）
  asset: string;           // 资产符号（固定为 "ATOS"）
  timestamp: number;       // Unix 时间戳（毫秒）
  from: string;            // 发送方地址
  to: string;              // 接收方地址
  status: 'pending' | 'completed' | 'failed';  // 交易状态
  txHash?: string;         // 交易哈希（公开交易必填，隐私交易可选）
  nullifier?: string;      // Nullifier（仅隐私交易有）
}
```

### TransactionType 枚举

```typescript
enum TransactionType {
  TRANSFER = 'TRANSFER',        // 公开转账 (Public -> Public)
  SHIELD = 'SHIELD',            // 屏蔽资金 (Public -> Private)
  UNSHIELD = 'UNSHIELD',        // 解除隐私 (Private -> Public)
  PRIVATE_SEND = 'PRIVATE_SEND', // 隐私转账 (Private -> Private)
  BRIDGE_DEPOSIT = 'BRIDGE_DEPOSIT',   // 跨链存款 (L1 -> L2)
  BRIDGE_WITHDRAW = 'BRIDGE_WITHDRAW'  // 跨链取款 (L2 -> L1)
}
```

---

## API 端点

### 1. 查询用户交易历史

**端点**: `GET /transactions/:address`

**描述**: 查询指定钱包地址的所有交易记录

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `address` | string | ✅ | 钱包地址（0x开头，小写） |
| `type` | string | ❌ | 交易类型过滤（可选值：TRANSFER, SHIELD, UNSHIELD, PRIVATE_SEND, BRIDGE_DEPOSIT, BRIDGE_WITHDRAW） |
| `status` | string | ❌ | 状态过滤（可选值：pending, completed, failed） |
| `page` | number | ❌ | 页码，默认 1 |
| `limit` | number | ❌ | 每页数量，默认 20，最大 100 |
| `sort` | string | ❌ | 排序方式，`desc`（最新优先，默认）或 `asc` |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "0xabc123...",
        "type": "SHIELD",
        "amount": "10.5",
        "asset": "ATOS",
        "timestamp": 1718726400000,
        "from": "0x1234567890abcdef1234567890abcdef12345678",
        "to": "0xabcdef1234567890abcdef1234567890abcdef12",
        "status": "completed",
        "txHash": "0xabc123def456..."
      },
      {
        "id": "0xnullifier123...",
        "type": "PRIVATE_SEND",
        "amount": "2.5",
        "asset": "ATOS",
        "timestamp": 1718726100000,
        "from": "0xabcdef1234567890abcdef1234567890abcdef12",
        "to": "0x9876543210fedcba9876543210fedcba98765432",
        "status": "completed",
        "nullifier": "0xnullifier123..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "totalPages": 8
    }
  }
}
```

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "Invalid wallet address format"
  }
}
```

---

### 2. 查询隐私交易（需要 Viewing Key）

**端点**: `POST /transactions/private`

**描述**: 使用 viewingKey 解密并查询用户的隐私交易记录

#### 请求体

```json
{
  "viewingKey": "1234567890123456789012345678901234567890",
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "type": "PRIVATE_SEND",
  "page": 1,
  "limit": 20
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `viewingKey` | string | ✅ | 用户的 viewing key（用于解密隐私交易） |
| `address` | string | ✅ | 钱包地址 |
| `type` | string | ❌ | 交易类型过滤（PRIVATE_SEND, SHIELD, UNSHIELD） |
| `page` | number | ❌ | 页码，默认 1 |
| `limit` | number | ❌ | 每页数量，默认 20 |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "0xnullifier456...",
        "type": "PRIVATE_SEND",
        "amount": "5.75",
        "asset": "ATOS",
        "timestamp": 1718725800000,
        "from": "0xabcdef1234567890abcdef1234567890abcdef12",
        "to": "0x9876543210fedcba9876543210fedcba98765432",
        "status": "completed",
        "nullifier": "0xnullifier456..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

---

### 3. 查询单笔交易详情

**端点**: `GET /transactions/:txHash`

**描述**: 根据交易哈希查询单笔交易的详细信息

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `txHash` | string | ✅ | 交易哈希 |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "0xabc123...",
    "type": "SHIELD",
    "amount": "10.5",
    "asset": "ATOS",
    "timestamp": 1718726400000,
    "from": "0x1234567890abcdef1234567890abcdef12345678",
    "to": "0xabcdef1234567890abcdef1234567890abcdef12",
    "status": "completed",
    "txHash": "0xabc123def456...",
    "blockNumber": 12345678,
    "gasUsed": "150000",
    "gasPrice": "2000000000"
  }
}
```

---

### 4. 批量查询交易（用于前端初始化）

**端点**: `POST /transactions/batch`

**描述**: 一次性获取用户的所有类型交易记录（优化性能）

#### 请求体

```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "viewingKey": "1234567890123456789012345678901234567890",
  "includeTypes": ["TRANSFER", "SHIELD", "UNSHIELD", "PRIVATE_SEND", "BRIDGE_DEPOSIT", "BRIDGE_WITHDRAW"],
  "limit": 50
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `address` | string | ✅ | 钱包地址 |
| `viewingKey` | string | ❌ | viewing key（用于解密隐私交易） |
| `includeTypes` | string[] | ❌ | 要包含的交易类型数组，默认全部 |
| `limit` | number | ❌ | 每种类型的最大返回数量，默认 50 |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "publicTransactions": [
      {
        "id": "0xabc123...",
        "type": "TRANSFER",
        "amount": "1.5",
        "asset": "ATOS",
        "timestamp": 1718726400000,
        "from": "0x1234...",
        "to": "0x5678...",
        "status": "completed",
        "txHash": "0xabc123..."
      }
    ],
    "privateTransactions": [
      {
        "id": "0xnullifier456...",
        "type": "PRIVATE_SEND",
        "amount": "2.3",
        "asset": "ATOS",
        "timestamp": 1718725800000,
        "from": "0xabcd...",
        "to": "0xefgh...",
        "status": "completed",
        "nullifier": "0xnullifier456..."
      }
    ],
    "bridgeTransactions": [
      {
        "id": "0xbridge789...",
        "type": "BRIDGE_DEPOSIT",
        "amount": "100",
        "asset": "ATOS",
        "timestamp": 1718725200000,
        "from": "0x1234...",
        "to": "0x1234...",
        "status": "completed",
        "txHash": "0xbridge789..."
      }
    ]
  }
}
```

---

## 数据来源说明

### 1. 公开交易 (TRANSFER, SHIELD, UNSHIELD)

**数据源**: L2 链上事件日志

**Shield 合约事件**:
- `Deposit(uint256 indexed commitment, uint256 leafIndex, uint256 timestamp, address indexed token, uint256 amount, bytes encryptedNote)`
- `Transfer(uint256 indexed nullifierHash, uint256 indexed newCommitment, bytes encryptedNote)`
- `Withdrawal(uint256 indexed nullifierHash, uint256 indexed commitment, uint256 amount, address indexed recipient)`

**查询逻辑**:
- TRANSFER: 查询 `from` 或 `to` 地址匹配的普通转账交易
- SHIELD: 查询 Shield 合约的 Deposit 事件，`from` 为调用者地址
- UNSHIELD: 查询 Shield 合约的 Withdrawal 事件

---

### 2. 隐私交易 (PRIVATE_SEND)

**数据源**: L2 链上 Transfer 事件 + Viewing Key 解密

**查询逻辑**:
1. 查询 Shield 合约的所有 Transfer 事件
2. 使用 viewingKey 尝试解密每个事件的 `encryptedNote`
3. 如果解密成功且 `recipient` 匹配用户地址，则为该用户的交易
4. 计算 nullifier: `Poseidon(commitment, spendingKey, leafIndex)`

**注意**: 
- 隐私交易的 `from` 和 `to` 需要通过解密后的 Note 获取
- 必须提供 viewingKey 才能查询

---

### 3. 跨链交易 (BRIDGE_DEPOSIT, BRIDGE_WITHDRAW)

**数据源**: Bridge 合约事件 + Bridge Service API

**Bridge 合约事件**:
- `BridgeAsset(uint32 destinationNetwork, uint32 depositCount, uint256 originNetwork, address originTokenAddress, uint256 amount, address destinationAddress)`
- `ClaimAsset(bytes32[32] smtProof, uint32 index, bytes32 mainnetExitRoot, bytes32 rollupExitRoot, ...)`

**查询逻辑**:
- BRIDGE_DEPOSIT: 查询 L1 Bridge 合约的 BridgeAsset 事件
- BRIDGE_WITHDRAW: 查询 L2 Bridge 合约的 BridgeAsset 事件
- 状态判断: 通过 Bridge Service API (`/bridges/:address`) 查询 `claim_tx_hash` 是否存在

---

## 金额格式化规则

所有金额字段必须遵循以下规则：

1. **单位**: ETH（不是 wei）
2. **精度**: 最多 8 位小数
3. **舍入**: 向下取整（截断），不四舍五入
4. **末尾零**: 自动隐藏

**示例**:
- `1.23456789` → `"1.23456789"`
- `1.234567891` → `"1.23456789"` (第9位截断)
- `1.23000000` → `"1.23"` (隐藏末尾零)
- `1.00000000` → `"1"` (全部隐藏)
- `1000000000000000000 wei` → `"1"`

**后端实现参考**:
```javascript
function formatAmount(weiValue) {
  const ethValue = Number(weiValue) / 1e18;
  const truncated = Math.floor(ethValue * 100_000_000) / 100_000_000;
  return truncated.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}
```

---

## 性能优化建议

### 1. 索引策略

建议在数据库中建立以下索引：

```sql
-- 按地址查询
CREATE INDEX idx_from_address ON transactions(from);
CREATE INDEX idx_to_address ON transactions(to);

-- 按时间排序
CREATE INDEX idx_timestamp ON transactions(timestamp DESC);

-- 复合索引（常用查询组合）
CREATE INDEX idx_address_type ON transactions(from, type);
CREATE INDEX idx_address_status ON transactions(from, status);
```

### 2. 缓存策略

- **Redis 缓存**: 缓存最近 100 条交易记录，TTL 5分钟
- **CDN 缓存**: 对于公开交易数据，可使用 CDN 缓存
- **增量同步**: 只查询最新的区块，避免全量扫描

### 3. 分页策略

- 使用游标分页（cursor-based）代替 offset 分页，提升大数据量性能
- 限制最大返回数量为 100 条/页

---

## 错误码定义

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `INVALID_ADDRESS` | 400 | 无效的钱包地址格式 |
| `INVALID_VIEWING_KEY` | 400 | 无效的 viewing key |
| `NOT_FOUND` | 404 | 交易不存在 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 前端集成示例

### TypeScript 接口定义

```typescript
// types.ts
export enum TransactionType {
  TRANSFER = 'TRANSFER',
  SHIELD = 'SHIELD',
  UNSHIELD = 'UNSHIELD',
  PRIVATE_SEND = 'PRIVATE_SEND',
  BRIDGE_DEPOSIT = 'BRIDGE_DEPOSIT',
  BRIDGE_WITHDRAW = 'BRIDGE_WITHDRAW'
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: string;
  asset: string;
  timestamp: number;
  from: string;
  to: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  nullifier?: string;
}

export interface TransactionResponse {
  success: boolean;
  data: {
    transactions: Transaction[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### API 调用示例

```typescript
// api/transactions.ts
const BASE_URL = 'https://your-api-domain.com/api';

export async function fetchTransactions(
  address: string,
  params?: {
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
): Promise<Transaction[]> {
  const queryParams = new URLSearchParams({
    page: String(params?.page || 1),
    limit: String(params?.limit || 20),
    ...(params?.type && { type: params.type }),
    ...(params?.status && { status: params.status }),
  });

  const response = await fetch(
    `${BASE_URL}/transactions/${address.toLowerCase()}?${queryParams}`
  );
  
  const result: TransactionResponse = await response.json();
  
  if (!result.success) {
    throw new Error(result.error?.message || 'Failed to fetch transactions');
  }
  
  return result.data.transactions;
}

export async function fetchPrivateTransactions(
  viewingKey: string,
  address: string,
  params?: {
    type?: string;
    page?: number;
    limit?: number;
  }
): Promise<Transaction[]> {
  const response = await fetch(`${BASE_URL}/transactions/private`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      viewingKey,
      address: address.toLowerCase(),
      ...params,
    }),
  });
  
  const result: TransactionResponse = await response.json();
  
  if (!result.success) {
    throw new Error(result.error?.message || 'Failed to fetch private transactions');
  }
  
  return result.data.transactions;
}
```

---

## 注意事项

1. **隐私保护**: 
   - 隐私交易必须通过 viewingKey 验证后才能返回
   - 不要在日志中记录 viewingKey
   - 使用 HTTPS 传输敏感数据

2. **数据一致性**:
   - 确保链上事件索引的完整性
   - 处理链重组（reorg）情况
   - 定期校验数据准确性

3. **兼容性**:
   - 保持与现有前端代码的数据结构兼容
   - 金额格式化规则必须严格遵循规范
   - 时间戳统一使用毫秒级 Unix 时间戳

4. **监控与告警**:
   - 监控 API 响应时间（目标 < 500ms）
   - 监控错误率（目标 < 1%）
   - 设置链上事件同步延迟告警

---

## 版本历史

- **v1.0** (2024-06-18): 初始版本，支持基本交易查询功能
