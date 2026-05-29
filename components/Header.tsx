
import React from 'react';
import { AssetType, WalletState } from '../types';
import { Wallet, ShieldCheck, ShieldAlert, LogOut } from 'lucide-react';
import { useDisconnect } from 'wagmi';

interface HeaderProps {
  wallet: WalletState;
  activeAsset: AssetType;
}

const Header: React.FC<HeaderProps> = ({ wallet, activeAsset }) => {
  const isPublic = activeAsset === AssetType.PUBLIC;
  const isPrivateInitialized = wallet.privacyKeys.isInitialized;
  const { disconnect } = useDisconnect();

  const handleDisconnect = () => {
    if (window.confirm('断开钱包连接并清除本地缓存的 session?\n\n(用于切换账户/清除幽灵 session)')) {
      // 断开 wagmi
      disconnect();
      // 清除所有 wagmi / WalletConnect 缓存的 localStorage 数据
      // (key 前缀: 'wagmi.', 'wc@', '@w3m', 'WCM_')
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('wagmi.') ||
          key.startsWith('wc@') ||
          key.startsWith('@w3m') ||
          key.startsWith('WCM_') ||
          key.includes('walletconnect')
        )) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
      console.log(`已清除 ${keysToRemove.length} 个 wagmi/WC 缓存项`);
      // 重载页面让 UI 状态干净
      setTimeout(() => window.location.reload(), 200);
    }
  };
  
  return (
    <header className="px-6 py-6 flex justify-between items-center z-20">
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full animate-pulse ${isPublic ? 'bg-green-500' : 'bg-purple-500'}`} />
        <span className={`text-xs font-semibold tracking-wide uppercase ${isPublic ? 'text-slate-500' : 'text-zinc-400'}`}>
          {isPublic ? 'Mainnet' : 'Privacy Layer'}
        </span>
      </div>
      
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium mono transition-all ${
        isPublic 
          ? 'bg-white border-slate-200 text-slate-600' 
          : isPrivateInitialized 
            ? 'bg-zinc-900 border-purple-500/30 text-zinc-300' 
            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
      }`}>
        {isPublic ? (
          <Wallet size={14} className="text-blue-500" />
        ) : isPrivateInitialized ? (
          <ShieldCheck size={14} className="text-purple-400" />
        ) : (
          <ShieldAlert size={14} className="text-zinc-600" />
        )}
        {isPublic 
          ? wallet.address 
          : isPrivateInitialized 
            ? wallet.privacyKeys.publicAddress.slice(0, 12) + '...'
            : 'Uninitialized'
        }
      </div>

      <button
        onClick={handleDisconnect}
        className={`${isPublic ? 'text-slate-400 hover:text-red-500' : 'text-zinc-500 hover:text-red-400'} transition-colors`}
        title="断开钱包 + 清除 session 缓存"
      >
        <LogOut size={20} />
      </button>
    </header>
  );
};

export default Header;
