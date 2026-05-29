
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
    if (window.confirm(
      '⚠️ 完整重置:\n\n' +
      '1. 断开钱包\n' +
      '2. 清除 WalletConnect session 缓存\n' +
      '3. 清除隐私 keys (privacy_keys)\n' +
      '4. 清除本地 Note 缓存 (privacy_notes)\n' +
      '5. 清除扫链进度 (last_scanned_block)\n\n' +
      '⚠️ 注意: 本地 Note 清除后无法恢复! 链上的 Note 会用新派生的 keys 重新扫描 ' +
      '(如果是同一个 EOA 签的 EIP-712, 跨设备恢复会拉回所有属于你的 Note).\n\n' +
      '确定继续?'
    )) {
      disconnect();
      // 强力清除: localStorage 全部清空 (除了浏览器其他网站可能用的, 但 localhost:3000 只我们用)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keysToRemove.push(key);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
      // sessionStorage 也清
      try { sessionStorage.clear(); } catch {}
      // IndexedDB (wallet connect v2 用这个) — best effort
      try {
        if ((window as any).indexedDB?.databases) {
          (window as any).indexedDB.databases().then((dbs: any[]) => {
            dbs?.forEach((db: any) => {
              if (db.name) (window as any).indexedDB.deleteDatabase(db.name);
            });
          });
        }
      } catch {}
      console.log(`✓ 已完整清除 ${keysToRemove.length} 项 localStorage + sessionStorage`);
      setTimeout(() => window.location.reload(), 500);
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
