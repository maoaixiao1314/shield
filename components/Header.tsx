
import React from 'react';
import { AssetType, WalletState } from '../types';
import { Wifi, Wallet, MoreVertical, ShieldCheck, ShieldAlert } from 'lucide-react';

interface HeaderProps {
  wallet: WalletState;
  activeAsset: AssetType;
}

const Header: React.FC<HeaderProps> = ({ wallet, activeAsset }) => {
  const isPublic = activeAsset === AssetType.PUBLIC;
  const isPrivateInitialized = wallet.privacyKeys.isInitialized;
  
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

      <button className={`${isPublic ? 'text-slate-400' : 'text-zinc-500'}`}>
        <MoreVertical size={20} />
      </button>
    </header>
  );
};

export default Header;
