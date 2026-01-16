
import React, { useState } from 'react';
import { WalletState, Transaction, TransactionType } from '../types';
import { Ghost, ShieldX, Sparkles, Key, Info, ExternalLink, Eye, EyeOff } from 'lucide-react';
import HistoryItem from './HistoryItem';

interface PrivateDashboardProps {
  wallet: WalletState;
  transactions: Transaction[];
  onAction: (type: TransactionType) => void;
}

const PrivateDashboard: React.FC<PrivateDashboardProps> = ({ wallet, transactions, onAction }) => {
  const [showKeys, setShowKeys] = useState(false);
  const [viewingPrivacyKey, setViewingPrivacyKey] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="text-center relative">
        <div className="absolute inset-0 blur-3xl opacity-20 bg-purple-500 -z-10 animate-pulse" />
        <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-widest mb-1 flex items-center justify-center gap-2">
          <Ghost size={14} /> Shielded Assets
        </h3>
        <h1 className="text-5xl font-black text-white tracking-tight flex items-center justify-center gap-2">
          {wallet.privateBalance}
        </h1>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
          <Sparkles size={12} className="text-yellow-400" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Deterministic ZK-Keys Active</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onAction(TransactionType.PRIVATE_SEND)}
          className="flex flex-col items-center justify-center p-6 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-lg hover:border-purple-500/50 transition-all group"
        >
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <Ghost size={24} />
          </div>
          <span className="text-sm font-bold text-zinc-200">Shielded Send</span>
        </button>

        <button 
          onClick={() => onAction(TransactionType.UNSHIELD)}
          className="flex flex-col items-center justify-center p-6 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-lg hover:border-pink-500/50 transition-all group"
        >
          <div className="p-3 bg-pink-500/10 text-pink-400 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ShieldX size={24} />
          </div>
          <span className="text-sm font-bold text-zinc-200">Unshield</span>
        </button>
      </div>

      {/* Key Info / Backup Section */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden transition-all">
        <button 
          onClick={() => setShowKeys(!showKeys)}
          className="w-full flex justify-between items-center p-4 hover:bg-zinc-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
             <Key size={18} className="text-purple-400" />
             <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Privacy Key Info</span>
          </div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800 px-2 py-1 rounded">
            {showKeys ? 'Hide' : 'Manage'}
          </div>
        </button>

        {showKeys && (
          <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2 duration-300">
            <p className="text-[10px] text-zinc-500 leading-relaxed italic">
              These keys are deterministically generated from your ETH signature. 
              Anyone with access to your ETH wallet can regenerate these privacy keys.
            </p>
            
            <div className="space-y-2">
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-purple-500 tracking-tighter">Spending Key</span>
                  <span className="text-xs mono text-zinc-400">
                    {viewingPrivacyKey ? wallet.privacyKeys.spendingKey : '••••••••••••••••••••'}
                  </span>
                </div>
                <button onClick={() => setViewingPrivacyKey(!viewingPrivacyKey)} className="text-zinc-600 hover:text-zinc-400 p-1">
                  {viewingPrivacyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-pink-500 tracking-tighter">Viewing Key</span>
                  <span className="text-xs mono text-zinc-400">
                    {viewingPrivacyKey ? wallet.privacyKeys.viewingKey : '••••••••••••••••••••'}
                  </span>
                </div>
                <button onClick={() => setViewingPrivacyKey(!viewingPrivacyKey)} className="text-zinc-600 hover:text-zinc-400 p-1">
                  {viewingPrivacyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
               <button className="flex-1 py-2 rounded-lg bg-zinc-800 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-zinc-700 transition-colors">
                 <Info size={12} /> Audit Tool
               </button>
               <button className="flex-1 py-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-purple-500/20 transition-colors">
                 <ExternalLink size={12} /> View Schema
               </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-zinc-100 font-bold">Encrypted Ledger (Local)</h4>
          <button className="text-purple-400 text-xs font-bold uppercase hover:underline">Clear Notes</button>
        </div>
        
        <div className="space-y-3">
          {transactions.map(tx => (
            <HistoryItem key={tx.id} tx={tx} isPrivate={true} />
          ))}
          {transactions.length === 0 && (
            <div className="py-12 text-center text-zinc-600 italic text-sm">
              No local notes found in current state.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivateDashboard;
