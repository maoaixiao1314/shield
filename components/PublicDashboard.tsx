
import React from 'react';
import { WalletState, Transaction, TransactionType } from '../types';
import { ArrowUpRight, ArrowDownLeft, Shield } from 'lucide-react';
import HistoryItem from './HistoryItem';

interface PublicDashboardProps {
  wallet: WalletState;
  transactions: Transaction[];
  onAction: (type: TransactionType) => void;
}

const PublicDashboard: React.FC<PublicDashboardProps> = ({ wallet, transactions, onAction }) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h3 className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-1">Public Balance</h3>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">{wallet.publicBalance}</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onAction(TransactionType.TRANSFER)}
          className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all group"
        >
          <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ArrowUpRight size={24} />
          </div>
          <span className="text-sm font-bold text-slate-700">Send ETH</span>
        </button>

        <button 
          onClick={() => onAction(TransactionType.SHIELD)}
          className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all group"
        >
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <Shield size={24} />
          </div>
          <span className="text-sm font-bold text-slate-700">Shield Funds</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-slate-900 font-bold">Recent Public Txs</h4>
          <button className="text-blue-600 text-xs font-bold uppercase hover:underline">View All</button>
        </div>
        
        <div className="space-y-3">
          {transactions.map(tx => (
            <HistoryItem key={tx.id} tx={tx} isPrivate={false} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PublicDashboard;
