
import React from 'react';
import { useTranslation } from 'react-i18next';
import { WalletState, Transaction, TransactionType } from '../types';
import { ArrowUpRight, ArrowDownLeft, Shield } from 'lucide-react';
import HistoryItem from './HistoryItem';

interface PublicDashboardProps {
  wallet: WalletState;
  transactions: Transaction[];
  onAction: (type: TransactionType) => void;
  onClearHistory?: () => void;
}

const PublicDashboard: React.FC<PublicDashboardProps> = ({ wallet, transactions, onAction, onClearHistory }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h3 className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-1">{t('publicBalance')}</h3>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">{wallet.publicBalance}</h1>
      </div>

      {/* Bridge Buttons - L1 <-> L2 */}
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onAction(TransactionType.BRIDGE_DEPOSIT)}
          className="flex flex-col items-center justify-center p-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-3xl shadow-lg hover:shadow-xl transition-all group"
        >
          <div className="p-3 bg-white/20 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ArrowDownLeft size={24} />
          </div>
          <span className="text-sm font-bold">{t('depositFromWallet')}</span>
        </button>

        <button 
          onClick={() => onAction(TransactionType.BRIDGE_WITHDRAW)}
          className="flex flex-col items-center justify-center p-6 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-3xl shadow-lg hover:shadow-xl transition-all group"
        >
          <div className="p-3 bg-white/20 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ArrowUpRight size={24} />
          </div>
          <span className="text-sm font-bold">{t('withdrawToWallet')}</span>
        </button>
      </div>

      {/* Action Buttons - Send & Shield */}
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onAction(TransactionType.TRANSFER)}
          className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all group"
        >
          <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ArrowUpRight size={24} />
          </div>
          <span className="text-sm font-bold text-slate-700">{t('sendATOSHI')}</span>
        </button>

        <button 
          onClick={() => onAction(TransactionType.SHIELD)}
          className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all group"
        >
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <Shield size={24} />
          </div>
          <span className="text-sm font-bold text-slate-700">{t('shieldFunds')}</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-slate-900 font-bold">{t('recentPublicTxs')}</h4>
          {transactions.length > 0 && onClearHistory && (
            <button 
              onClick={() => {
                if (window.confirm(t('clearHistoryConfirm'))) {
                  onClearHistory();
                }
              }}
              className="text-red-500 text-xs font-bold uppercase hover:underline"
            >
              {t('clearHistory')}
            </button>
          )}
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
