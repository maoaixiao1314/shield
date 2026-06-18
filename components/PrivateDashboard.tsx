
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WalletState, Transaction, TransactionType } from '../types';
import { Ghost, ShieldX, Sparkles, Key, Info, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { formatAmount } from '../utils/amount-formatter';
import HistoryItem from './HistoryItem';
import QRCodeDisplay from './QRCodeDisplay';

interface LocalNote {
  amount: string | bigint;   // String or BigInt (loadNotes converts amount to BigInt)
  secret: string;
  nullifier: string;
  recipient: string;
  spent: boolean;
  leafIndex: number;
  commitment?: string;
}

interface PrivateDashboardProps {
  wallet: WalletState;
  transactions: Transaction[];
  notes: LocalNote[];                   // ⭐ Added: local Note list
  onAction: (type: TransactionType) => void;
  onClearHistory?: () => void;
  onShowToast?: (message: string) => void;  // Callback to show toast from parent
}

const PrivateDashboard: React.FC<PrivateDashboardProps> = ({ wallet, transactions, notes, onAction, onClearHistory, onShowToast }) => {
  const { t } = useTranslation();
  const [showKeys, setShowKeys] = useState(false);
  const [viewingPrivacyKey, setViewingPrivacyKey] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="text-center relative">
        <div className="absolute inset-0 blur-3xl opacity-20 bg-purple-500 -z-10 animate-pulse" />
        <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-widest mb-1 flex items-center justify-center gap-2">
          <Ghost size={14} /> {t('shieldedAssets')}
        </h3>
        <h1 className="text-5xl font-black text-white tracking-tight flex items-center justify-center gap-2">
          {wallet.privateBalance}
        </h1>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
          <Sparkles size={12} className="text-yellow-400" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">{t('deterministicZKKeys')}</span>
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
          <span className="text-sm font-bold text-zinc-200">{t('shieldedSend')}</span>
        </button>

        <button
          onClick={() => onAction(TransactionType.UNSHIELD)}
          className="flex flex-col items-center justify-center p-6 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-lg hover:border-pink-500/50 transition-all group"
        >
          <div className="p-3 bg-pink-500/10 text-pink-400 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ShieldX size={24} />
          </div>
          <span className="text-sm font-bold text-zinc-200">{t('unshield')}</span>
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
             <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">{t('privacyKeyInfo')}</span>
          </div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800 px-2 py-1 rounded">
            {showKeys ? t('hide') : t('manage')}
          </div>
        </button>

        {showKeys && (
          <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2 duration-300">
            <p className="text-[10px] text-zinc-500 leading-relaxed italic">
              {t('keyInfoDesc')}
            </p>

            <div className="space-y-2">
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-purple-500 tracking-tighter">{t('spendingKey')}</span>
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
                  <span className="text-[9px] font-black uppercase text-pink-500 tracking-tighter">{t('viewingKey')}</span>
                  <span className="text-xs mono text-zinc-400">
                    {viewingPrivacyKey ? wallet.privacyKeys.viewingKey : '••••••••••••••••••••'}
                  </span>
                </div>
                <button onClick={() => setViewingPrivacyKey(!viewingPrivacyKey)} className="text-zinc-600 hover:text-zinc-400 p-1">
                  {viewingPrivacyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Audit Tool + View Schema buttons removed — they had no onClick
                handlers and confused users into thinking the buttons were broken.
                Bring back once the underlying features (proof-of-reserves audit +
                ZK circuit schema browser) are implemented. */}

            {/* My privacy receiving code — used by others to transfer to me */}
            {(wallet.privacyKeys as any).receivingCode && (
              <div className="mt-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-tighter">{t('myReceivingCode')}</span>

                {/* QR code - the primary sharing method, the other party just scans it */}
                <div className="mt-3 flex justify-center bg-zinc-950 p-3 rounded-lg">
                  <QRCodeDisplay data={(wallet.privacyKeys as any).receivingCode} size={200} />
                </div>

                {/* Also provide plain text (suitable for pasting into IM/email) */}
                <details className="mt-3">
                  <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300">▸ {t('showTextFormat')}</summary>
                  <div className="mt-2 break-all text-[10px] font-mono text-zinc-400 bg-zinc-900 p-2 rounded max-h-32 overflow-y-auto">
                    {(wallet.privacyKeys as any).receivingCode}
                  </div>
                </details>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText((wallet.privacyKeys as any).receivingCode);
                    onShowToast?.(t('receivingCodeCopied'));
                  }}
                  className="mt-3 w-full py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-colors"
                >
                  {t('copyReceivingCode')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ⭐ Changed to Note list: shows amount/status/leafIndex of all Notes in the local pool */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-zinc-100 font-bold">{t('privacyNoteList')}</h4>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
            {t('available')} {notes.filter(n => !n.spent).length} / {t('total')} {notes.length}
          </span>
        </div>

        <div className="space-y-2">
          {notes.length === 0 ? (
            <div className="py-12 text-center text-zinc-600 italic text-sm">
              {t('noNotesYet')}
            </div>
          ) : (
            notes
              .slice()
              .sort((a, b) => (a.spent ? 1 : 0) - (b.spent ? 1 : 0))   // available ones first
              .map((note, i) => {
                const amountEther = (() => {
                  try {
                    const big = typeof note.amount === 'bigint' ? note.amount : BigInt(note.amount);
                    // Format with precision rules (2 decimals max, hide trailing zeros, floor)
                    return formatAmount(big, true);
                  } catch {
                    return '?';
                  }
                })();
                const commitmentShort = note.commitment
                  ? `${note.commitment.slice(0, 6)}...${note.commitment.slice(-4)}`
                  : 'unknown';
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border flex justify-between items-center ${
                      note.spent
                        ? 'bg-zinc-900/30 border-zinc-800 opacity-50'
                        : 'bg-zinc-900 border-purple-500/30'
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-black ${note.spent ? 'line-through text-zinc-500' : 'text-purple-300'}`}>
                          {amountEther} ATOS
                        </span>
                        {note.spent && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 uppercase tracking-widest">
                            {t('spent')}
                          </span>
                        )}
                        {!note.spent && note.leafIndex < 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 uppercase tracking-widest">
                            {t('pendingSync')}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        leaf #{note.leafIndex} · {commitmentShort}
                      </span>
                    </div>
                    <Ghost size={16} className={note.spent ? 'text-zinc-700' : 'text-purple-400'} />
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* On-chain transaction records (for this session, so the user can see on-chain tx hashes) */}
      {transactions.length > 0 && (
        <div className="space-y-4 mt-6">
          <div className="flex justify-between items-center">
            <h4 className="text-zinc-100 font-bold">{t('sessionTransactions')}</h4>
            {onClearHistory && (
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
              <HistoryItem key={tx.id} tx={tx} isPrivate={true} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateDashboard;
