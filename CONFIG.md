# Atoshi Privacy Wallet - 配置指南

## 环境变量配置

在项目根目录创建 `.env.local` 文件：

```bash
# L2 RPC 配置
VITE_L2_RPC_URL=http://54.169.30.130:8123
VITE_L2_CHAIN_ID=67890

# 合约地址（部署后填入）
VITE_SHIELD_CONTRACT=0x0000000000000000000000000000000000000000
VITE_VERIFIER_CONTRACT=0x0000000000000000000000000000000000000000

# Prover 配置
VITE_PROVER_URL=http://localhost:8080
VITE_USE_WASM_PROVER=true

# 演示模式（合约未部署时使用模拟数据）
VITE_DEMO_MODE=true
```

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制上面的配置到 `.env.local` 文件

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

## 演示模式说明

当 `VITE_DEMO_MODE=true` 时：
- ✅ 可以测试所有 UI 交互
- ✅ 可以测试密钥派生
- ✅ 使用模拟的交易数据
- ❌ 不会真正调用合约

当合约部署完成后：
1. 更新 `VITE_SHIELD_CONTRACT` 地址
2. 设置 `VITE_DEMO_MODE=false`
3. 重启开发服务器

## 连接 MetaMask

1. 打开 MetaMask
2. 添加自定义网络：
   - 网络名称：Atoshi L2
   - RPC URL：http://54.169.30.130:8123
   - Chain ID：67890
   - 货币符号：ETH
3. 刷新页面，点击"连接钱包"

## 功能测试清单

### ✅ 当前可测试（演示模式）
- [x] 连接钱包
- [x] 查看公共余额
- [x] 隐私密钥派生
- [x] UI 交互流程
- [x] 交易历史展示

### ⏳ 等待合约部署
- [ ] Shield（存款）
- [ ] 隐私转账
- [ ] Unshield（提款）
- [ ] 链上数据查询

