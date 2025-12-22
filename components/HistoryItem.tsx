
import React from 'react';
import { Transaction, TransactionType } from '../types';
import { ArrowUpRight, ArrowDownLeft, Shield, Ghost, Info } from 'lucide-react';

interface HistoryItemProps {
  tx: Transaction;
  isPrivate: boolean;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ tx, isPrivate }) => {
  const getIcon = () => {
    switch (tx.type) {
      case TransactionType.TRANSFER: return <ArrowUpRight size={18} />;
      case TransactionType.SHIELD: return <Shield size={18} />;
      case TransactionType.UNSHIELD: return <ArrowDownLeft size={18} />;
      case TransactionType.PRIVATE_SEND: return <Ghost size={18} />;
      default: return <Info size={18} />;
    }
  };

  const getColorClass = () => {
    if (isPrivate) {
      return tx.type === TransactionType.PRIVATE_SEND ? 'text-purple-400 bg-purple-400/10' : 'text-pink-400 bg-pink-400/10';
    }
    return tx.type === TransactionType.SHIELD ? 'text-indigo-600 bg-indigo-50' : 'text-blue-600 bg-blue-50';
  };

  const getLabel = () => {
    switch (tx.type) {
      case TransactionType.TRANSFER: return 'Public Transfer';
      case TransactionType.SHIELD: return 'Deposit (Shield)';
      case TransactionType.UNSHIELD: return 'Withdraw (Unshield)';
      case TransactionType.PRIVATE_SEND: return 'Shielded Transfer';
      default: return 'Transaction';
    }
  };

  return (
    <div className={`p-4 rounded-2xl flex items-center justify-between border transition-all hover:scale-[1.02] ${isPrivate ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-slate-100 text-slate-700'}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${getColorClass()}`}>
          {getIcon()}
        </div>
        <div>
          <div className="text-sm font-bold flex items-center gap-1.5">
            {getLabel()}
            {tx.status === 'completed' && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          </div>
          <div className="text-[10px] opacity-50 mono uppercase mt-0.5">
            {isPrivate ? (tx.nullifier ? `Nullifier: ${tx.nullifier}` : 'Hidden on-chain') : `Tx: ${tx.txHash}`}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-black ${isPrivate ? 'text-zinc-100' : 'text-slate-900'}`}>
          {tx.amount}
        </div>
        <div className="text-[10px] opacity-40 font-medium">
          {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default HistoryItem;
