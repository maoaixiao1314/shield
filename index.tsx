import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from './wagmi.config';
import '@rainbow-me/rainbowkit/styles.css';
import './i18n'; // Initialize i18n
import i18n from 'i18next';

// Set page title based on current language
const updateTitle = () => {
  const lang = i18n.language;
  if (lang.startsWith('zh')) {
    document.title = 'Atoshi 隐私钱包';
  } else {
    document.title = 'Atoshi Privacy Wallet';
  }
};

// Update title on initial load
updateTitle();

// Listen for language changes and update title accordingly
i18n.on('languageChanged', updateTitle);

const queryClient = new QueryClient();

// ============================================================================
// Secure context detection: the Web Crypto API (crypto.subtle) is only available
// over HTTPS / localhost. If the user accesses via a network IP (e.g.
// http://192.168.x.x:3000), block it here and show a clear error message.
// Otherwise the later ECIES encryption / EIP-712 derivation would throw cryptic errors.
// ============================================================================
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

// ============================================================================
// BigInt global serialization patch
// By default JSON.stringify(10n) throws "Do not know how to serialize a BigInt".
// This breaks any library that writes to localStorage / calls RPC.
// Here we add toJSON() to serialize BigInt as a string. A standard industry hack.
// ============================================================================
;(BigInt.prototype as any).toJSON = function () { return this.toString(); };

if (typeof crypto === 'undefined' || !crypto.subtle) {
  rootElement.innerHTML = `
    <div style="max-width: 600px; margin: 80px auto; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #fff; background: #0a0a0a; border: 1px solid #ef4444; border-radius: 16px;">
      <h1 style="color: #ef4444; margin-top: 0;">⚠️ Browser is not in a secure context</h1>
      <p style="line-height: 1.6;">Privacy transactions require the Web Crypto API (for ECIES encryption), but it only works in the following environments:</p>
      <ul style="line-height: 1.8;">
        <li>HTTPS websites (production)</li>
        <li><code style="background: #1a1a1a; padding: 2px 6px; border-radius: 4px;">http://localhost</code> (development)</li>
        <li><code style="background: #1a1a1a; padding: 2px 6px; border-radius: 4px;">http://127.0.0.1</code> (development)</li>
      </ul>
      <p style="background: #1a1a1a; padding: 12px; border-radius: 8px; line-height: 1.6;">
        <b>Current address:</b> <code>${window.location.href}</code><br/>
        <b>Fix:</b> change the IP in the browser address bar to <code>localhost</code>.<br/>
        For example <code>http://192.168.1.5:3000</code> → <code>http://localhost:3000</code>
      </p>
      <p style="color: #888; font-size: 12px;">This is a browser security standard; all modern browsers restrict the Web Crypto API this way.</p>
    </div>
  `;
  throw new Error('crypto.subtle is unavailable — must access via localhost or HTTPS');
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
