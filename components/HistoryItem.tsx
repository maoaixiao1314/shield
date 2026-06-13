
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction, TransactionType } from '../types';
import { ArrowUpRight, ArrowDownLeft, Shield, Ghost, Info } from 'lucide-react';
import Toast from './Toast';

interface HistoryItemProps {
  tx: Transaction;
  isPrivate: boolean;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ tx, isPrivate }) => {
  const { t } = useTranslation();
  const [showToast, setShowToast] = useState(false);

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
      case TransactionType.TRANSFER: return t('transactionType.publicTransfer');
      case TransactionType.SHIELD: return t('transactionType.depositShield');
      case TransactionType.UNSHIELD: return t('transactionType.withdrawUnshield');
      case TransactionType.PRIVATE_SEND: return t('transactionType.shieldedTransfer');
      default: return t('transactionType.transaction');
    }
  };

  // Format and truncate tx hash
  const formatTxHash = (hash?: string) => {
    if (!hash) return 'N/A';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  // Copy tx hash to clipboard
  const handleCopyTxHash = () => {
    if (tx.txHash) {
      navigator.clipboard.writeText(tx.txHash);
      setShowToast(true);
    }
  };

  return (
    <div className={`p-4 rounded-2xl flex items-center justify-between border transition-all hover:scale-[1.02] ${isPrivate ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-slate-100 text-slate-700'}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`p-2.5 rounded-xl ${getColorClass()}`}>
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold flex items-center gap-1.5">
            {getLabel()}
            {tx.status === 'completed' && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          </div>
          {/* TX Hash with truncation, underline, and click-to-copy */}
          {!isPrivate && tx.txHash ? (
            <button
              onClick={handleCopyTxHash}
              className="text-[10px] opacity-50 mono uppercase mt-0.5 truncate cursor-pointer hover:opacity-70 transition-opacity underline decoration-dotted underline-offset-2"
              title={`Click to copy: ${tx.txHash}`}
            >
              Tx: {formatTxHash(tx.txHash)}
            </button>
          ) : isPrivate ? (
            <div className="text-[10px] opacity-50 mono uppercase mt-0.5">
              {tx.nullifier ? `Nullifier: ${tx.nullifier.slice(0, 10)}...${tx.nullifier.slice(-8)}` : 'Hidden on-chain'}
            </div>
          ) : null}
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-2">
        <div className={`text-sm font-black ${isPrivate ? 'text-zinc-100' : 'text-slate-900'}`}>
          {tx.amount}
        </div>
        <div className="text-[10px] opacity-40 font-medium">
          {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Toast notification */}
      <Toast 
        message="TX hash copied!" 
        isVisible={showToast} 
        onClose={() => setShowToast(false)} 
      />
    </div>
  );
};

export default HistoryItem;
