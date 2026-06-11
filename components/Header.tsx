
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
      '⚠️ Full reset:\n\n' +
      '1. Disconnect wallet\n' +
      '2. Clear WalletConnect session cache\n' +
      '3. Clear privacy keys (privacy_keys)\n' +
      '4. Clear local Note cache (privacy_notes)\n' +
      '5. Clear chain scan progress (last_scanned_block)\n\n' +
      '⚠️ Note: Local Notes cannot be recovered once cleared! On-chain Notes will be re-scanned using newly derived keys ' +
      '(if signed with EIP-712 by the same EOA, cross-device recovery will pull back all Notes belonging to you).\n\n' +
      'Are you sure you want to continue?'
    )) {
      disconnect();
      // Forceful clear: wipe all of localStorage (except what other sites might use, but localhost:3000 is only ours)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keysToRemove.push(key);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
      // Clear sessionStorage too
      try { sessionStorage.clear(); } catch {}
      // IndexedDB (wallet connect v2 uses this) — best effort
      try {
        if ((window as any).indexedDB?.databases) {
          (window as any).indexedDB.databases().then((dbs: any[]) => {
            dbs?.forEach((db: any) => {
              if (db.name) (window as any).indexedDB.deleteDatabase(db.name);
            });
          });
        }
      } catch {}
      console.log(`✓ Fully cleared ${keysToRemove.length} items from localStorage + sessionStorage`);
      setTimeout(() => window.location.reload(), 500);
    }
  };
  
  return (
    <header className="px-6 py-6 flex justify-between items-center z-20 gap-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className={`w-3 h-3 rounded-full animate-pulse ${isPublic ? 'bg-green-500' : 'bg-purple-500'}`} />
        <span className={`text-xs font-semibold tracking-wide uppercase ${isPublic ? 'text-slate-500' : 'text-zinc-400'}`}>
          {isPublic ? 'Mainnet' : 'Privacy Layer'}
        </span>
      </div>
      
      <div className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium mono transition-all ${
        isPublic 
          ? 'bg-white border-slate-200 text-slate-600' 
          : isPrivateInitialized 
            ? 'bg-zinc-900 border-purple-500/30 text-zinc-300' 
            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
      }`}>
        {isPublic ? (
          <Wallet size={14} className="text-blue-500 flex-shrink-0" />
        ) : isPrivateInitialized ? (
          <ShieldCheck size={14} className="text-purple-400 flex-shrink-0" />
        ) : (
          <ShieldAlert size={14} className="text-zinc-600 flex-shrink-0" />
        )}
        <span className="truncate">
          {isPublic 
            ? wallet.address 
            : isPrivateInitialized 
              ? wallet.privacyKeys.publicAddress.slice(0, 12) + '...'
              : 'Uninitialized'
          }
        </span>
      </div>

      <button
        onClick={handleDisconnect}
        className={`${isPublic ? 'text-slate-400 hover:text-red-500' : 'text-zinc-500 hover:text-red-400'} transition-colors flex-shrink-0`}
        title="Disconnect wallet + clear session cache"
      >
        <LogOut size={20} />
      </button>
    </header>
  );
};

export default Header;
