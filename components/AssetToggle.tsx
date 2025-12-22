
import React from 'react';
import { AssetType } from '../types';
import { Globe, ShieldCheck } from 'lucide-react';

interface AssetToggleProps {
  activeAsset: AssetType;
  setActiveAsset: (asset: AssetType) => void;
}

const AssetToggle: React.FC<AssetToggleProps> = ({ activeAsset, setActiveAsset }) => {
  return (
    <div className="flex bg-zinc-900/10 p-1.5 rounded-2xl relative">
      <div 
        className={`absolute top-1.5 bottom-1.5 transition-all duration-300 rounded-xl shadow-sm ${
          activeAsset === AssetType.PUBLIC 
            ? 'left-1.5 right-[50%] public-gradient' 
            : 'left-[50%] right-1.5 privacy-gradient'
        }`}
      />
      
      <button 
        onClick={() => setActiveAsset(AssetType.PUBLIC)}
        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 rounded-xl relative z-10 transition-colors ${
          activeAsset === AssetType.PUBLIC ? 'text-white' : 'text-slate-500'
        }`}
      >
        <Globe size={18} />
        <span className="text-sm font-bold uppercase tracking-wider">Public</span>
      </button>

      <button 
        onClick={() => setActiveAsset(AssetType.PRIVATE)}
        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 rounded-xl relative z-10 transition-colors ${
          activeAsset === AssetType.PRIVATE ? 'text-white' : 'text-zinc-400'
        }`}
      >
        <ShieldCheck size={18} />
        <span className="text-sm font-bold uppercase tracking-wider">Private</span>
      </button>
    </div>
  );
};

export default AssetToggle;
