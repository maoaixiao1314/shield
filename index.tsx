import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from './wagmi.config';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

// ============================================================================
// 安全上下文检测: Web Crypto API (crypto.subtle) 只在 HTTPS / localhost 才有.
// 如果用户用网络 IP (e.g. http://192.168.x.x:3000) 访问,这里直接挡住,给清晰
// 错误信息. 否则后面 ECIES 加密 / EIP-712 派生都会报神秘错.
// ============================================================================
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

// ============================================================================
// BigInt 全局序列化补丁
// 默认 JSON.stringify(10n) 抛 "Do not know how to serialize a BigInt".
// 这破坏了任何写 localStorage / 调 RPC 的库.
// 这里加 toJSON() 让 BigInt 序列化为字符串. 业界标准 hack.
// ============================================================================
;(BigInt.prototype as any).toJSON = function () { return this.toString(); };

if (typeof crypto === 'undefined' || !crypto.subtle) {
  rootElement.innerHTML = `
    <div style="max-width: 600px; margin: 80px auto; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #fff; background: #0a0a0a; border: 1px solid #ef4444; border-radius: 16px;">
      <h1 style="color: #ef4444; margin-top: 0;">⚠️ 浏览器不在安全上下文</h1>
      <p style="line-height: 1.6;">隐私交易需要 Web Crypto API (用于 ECIES 加密),但只能在以下环境运行:</p>
      <ul style="line-height: 1.8;">
        <li>HTTPS 网站 (生产)</li>
        <li><code style="background: #1a1a1a; padding: 2px 6px; border-radius: 4px;">http://localhost</code> (开发)</li>
        <li><code style="background: #1a1a1a; padding: 2px 6px; border-radius: 4px;">http://127.0.0.1</code> (开发)</li>
      </ul>
      <p style="background: #1a1a1a; padding: 12px; border-radius: 8px; line-height: 1.6;">
        <b>当前地址:</b> <code>${window.location.href}</code><br/>
        <b>修复:</b> 把浏览器地址栏的 IP 改成 <code>localhost</code> 即可.<br/>
        例如 <code>http://192.168.1.5:3000</code> → <code>http://localhost:3000</code>
      </p>
      <p style="color: #888; font-size: 12px;">这是浏览器安全标准,所有现代浏览器都这样限制 Web Crypto API.</p>
    </div>
  `;
  throw new Error('crypto.subtle 不可用 — 必须用 localhost 或 HTTPS 访问');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
