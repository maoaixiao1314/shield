
import React from 'react';
import { AssetType, WalletState } from '../types';
import { Wifi, Wallet, MoreVertical } from 'lucide-react';

interface HeaderProps {
  wallet: WalletState;
  activeAsset: AssetType;
}

const Header: React.FC<HeaderProps> = ({ wallet, activeAsset }) => {
  const isPublic = activeAsset === AssetType.PUBLIC;
  
  return (
    <header className="px-6 py-6 flex justify-between items-center z-20">
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full animate-pulse ${isPublic ? 'bg-green-500' : 'bg-purple-500'}`} />
        <span className={`text-xs font-semibold tracking-wide uppercase ${isPublic ? 'text-slate-500' : 'text-zinc-400'}`}>
          Ethereum Mainnet
        </span>
      </div>
      
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium mono ${isPublic ? 'bg-white border-slate-200 text-slate-600' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>
        <Wallet size={14} />
        {isPublic ? wallet.address : wallet.privateKeyAddress.slice(0, 10) + '...'}
      </div>

      <button className={`${isPublic ? 'text-slate-400' : 'text-zinc-500'}`}>
        <MoreVertical size={20} />
      </button>
    </header>
  );
};

export default Header;
