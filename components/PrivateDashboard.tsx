
import React from 'react';
import { WalletState, Transaction, TransactionType } from '../types';
import { Ghost, ShieldX, Sparkles } from 'lucide-react';
import HistoryItem from './HistoryItem';

interface PrivateDashboardProps {
  wallet: WalletState;
  transactions: Transaction[];
  onAction: (type: TransactionType) => void;
}

const PrivateDashboard: React.FC<PrivateDashboardProps> = ({ wallet, transactions, onAction }) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Powered by ZK-SNARKs</span>
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

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-zinc-100 font-bold">Encrypted Ledger (Local)</h4>
          <button className="text-purple-400 text-xs font-bold uppercase hover:underline">Audit</button>
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
