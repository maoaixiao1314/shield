#!/bin/bash

echo "🔍 Atoshi Privacy Wallet - 诊断脚本"
echo "=================================="
echo ""

# 1. 检查 Node.js 版本
echo "1️⃣ Node.js 版本:"
node --version
echo ""

# 2. 检查依赖
echo "2️⃣ 检查关键依赖:"
cd ~/shield
if [ -f "package.json" ]; then
  echo "✅ package.json 存在"
  if [ -d "node_modules" ]; then
    echo "✅ node_modules 存在"
    if [ -d "node_modules/react" ]; then
      echo "✅ react 已安装"
    else
      echo "❌ react 未安装"
    fi
    if [ -d "node_modules/ethers" ]; then
      echo "✅ ethers 已安装"
    else
      echo "❌ ethers 未安装"
    fi
  else
    echo "❌ node_modules 不存在，需要运行 npm install"
  fi
else
  echo "❌ package.json 不存在"
fi
echo ""

# 3. 检查关键文件
echo "3️⃣ 检查关键文件:"
files=("index.html" "index.tsx" "App.tsx" "types.ts" "config.ts")
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file 缺失"
  fi
done
echo ""

# 4. 检查 SDK 文件
echo "4️⃣ 检查 SDK 文件:"
if [ -d "sdk" ]; then
  echo "✅ sdk/ 目录存在"
  if [ -f "sdk/privacy-sdk.ts" ]; then
    echo "✅ privacy-sdk.ts"
  else
    echo "❌ privacy-sdk.ts 缺失"
  fi
  if [ -f "sdk/wasm-prover.ts" ]; then
    echo "✅ wasm-prover.ts"
  else
    echo "❌ wasm-prover.ts 缺失"
  fi
else
  echo "❌ sdk/ 目录不存在"
fi
echo ""

# 5. 检查 hooks 文件
echo "5️⃣ 检查 hooks 文件:"
if [ -d "hooks" ]; then
  echo "✅ hooks/ 目录存在"
  if [ -f "hooks/useWallet.ts" ]; then
    echo "✅ useWallet.ts"
  else
    echo "❌ useWallet.ts 缺失"
  fi
else
  echo "❌ hooks/ 目录不存在"
fi
echo ""

echo "=================================="
echo "诊断完成！"
echo ""
echo "💡 如果有缺失的依赖，运行："
echo "   cd ~/shield && npm install"
echo ""
echo "💡 如果有缺失的文件，请告诉我，我会帮你创建"

