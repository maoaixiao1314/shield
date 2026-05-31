
import React, { useState, useEffect } from 'react';
import { TransactionType, AssetType } from '../types';
import { X, Loader2, Sparkles, ShieldCheck, QrCode } from 'lucide-react';
import QRCodeScanner from './QRCodeScanner';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: TransactionType;
  activeAsset: AssetType;
  onConfirm: (amount: string, to: string) => void;
}

const ActionModal: React.FC<ActionModalProps> = ({ isOpen, onClose, type, activeAsset, onConfirm }) => {
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [proofProgress, setProofProgress] = useState(0);
  const [showScanner, setShowScanner] = useState(false);

  const getTitle = () => {
    switch (type) {
      case TransactionType.TRANSFER: return 'Send ATOSHI';
      case TransactionType.PRIVATE_SEND: return 'Privacy Send';
      case TransactionType.SHIELD: return 'Shield Funds';
      case TransactionType.UNSHIELD: return 'Unshield Funds';
      default: return 'Transaction';
    }
  };

  const handleConfirm = async () => {
    // Shield does not need a "to" (it deposits into your own pool; the business layer uses your own publicAddress)
    if (!amount) return;
    if (type !== TransactionType.SHIELD && !to) return;
    setIsProcessing(true);

    // Simulate ZK-Proof generation for privacy tasks
    if (activeAsset === AssetType.PRIVATE || type === TransactionType.SHIELD || type === TransactionType.UNSHIELD) {
      for (let i = 0; i <= 100; i += 5) {
        setProofProgress(i);
        await new Promise(r => setTimeout(r, 80));
      }
    } else {
      await new Promise(r => setTimeout(r, 1000));
    }

    onConfirm(amount, to);
    setIsProcessing(false);
    setProofProgress(0);
  };

  const isDark = activeAsset === AssetType.PRIVATE;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 relative shadow-2xl transition-all ${isDark ? 'bg-zinc-950 border border-zinc-800 text-white' : 'bg-white text-slate-900'}`}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-800/10 opacity-50">
          <X size={24} />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-black mb-1">{getTitle()}</h2>
          <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
            {isDark ? 'Using ZK-SNARK zero-knowledge proofs for privacy.' : 'Standard EVM transaction on-chain.'}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-purple-400' : 'text-blue-600'}`}>Amount</label>
            <div className={`relative rounded-2xl border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'} focus-within:ring-2 ${isDark ? 'focus-within:ring-purple-500/30' : 'focus-within:ring-blue-500/20'}`}>
              <input 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent p-4 text-lg font-bold outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs opacity-40 uppercase">
                ATOSHI
              </span>
            </div>
          </div>

          {/* Shield type: funds are deposited into your own privacy pool, so no recipient input is needed */}
          {type === TransactionType.SHIELD ? (
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Deposit to</span>
              <p className="mt-1 text-xs">Your own privacy pool (no recipient address required)</p>
            </div>
          ) : (
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-purple-400' : 'text-blue-600'}`}>
                {type === TransactionType.PRIVATE_SEND ? 'Receiver Privacy Address' : 'Receiver Address'}
              </label>
              <div className={`relative rounded-2xl border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'} focus-within:ring-2 ${isDark ? 'focus-within:ring-purple-500/30' : 'focus-within:ring-blue-500/20'}`}>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={
                    type === TransactionType.PRIVATE_SEND
                      ? "Paste the recipient's receiving code or tap scan on the right →"
                      : (isDark ? 'zk_atos_...' : '0x...')
                  }
                  className="w-full bg-transparent p-4 pr-14 text-xs font-medium mono outline-none"
                />
                {/* Scan button — only appears during privacy transfers */}
                {type === TransactionType.PRIVATE_SEND && (
                  <button
                    onClick={() => setShowScanner(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                    title="Scan the recipient's QR code"
                    type="button"
                  >
                    <QrCode size={18} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Overlay scanner shown during privacy transfers */}
          {showScanner && (
            <QRCodeScanner
              onScan={(text) => {
                setTo(text);
                setShowScanner(false);
              }}
              onClose={() => setShowScanner(false)}
            />
          )}

          {isProcessing && proofProgress > 0 && (
            <div className="space-y-2 py-4 animate-in fade-in">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tighter">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-yellow-500 animate-pulse" />
                  Generating ZK-Proof locally
                </span>
                <span>{proofProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full privacy-gradient transition-all duration-300" 
                  style={{ width: `${proofProgress}%` }}
                />
              </div>
            </div>
          )}

          <button 
            disabled={isProcessing || !amount || (type !== TransactionType.SHIELD && !to)}
            onClick={handleConfirm}
            className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
              isDark ? 'privacy-gradient text-white' : 'public-gradient text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Confirm {getTitle()}
                <ShieldCheck size={20} />
              </>
            )}
          </button>
          
          <p className="text-[10px] text-center opacity-30 px-6 leading-relaxed">
            {isDark 
              ? 'Funds will be moved using a nullifier circuit. No linking data will be visible to public explorers.'
              : 'This is a public transaction. Details will be visible on-chain to anyone.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;
