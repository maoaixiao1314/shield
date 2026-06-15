
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TransactionType, AssetType } from '../types';
import { X, Loader2, Sparkles, ShieldCheck, QrCode } from 'lucide-react';
import QRCodeScanner from './QRCodeScanner';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: TransactionType;
  activeAsset: AssetType;
  onConfirm: (amount: string, to: string) => void;
  onShowToast?: (message: string) => void;  // Callback to show toast from parent
}

const ActionModal: React.FC<ActionModalProps> = ({ isOpen, onClose, type, activeAsset, onConfirm, onShowToast }) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [proofProgress, setProofProgress] = useState(0);
  const [showScanner, setShowScanner] = useState(false);

  const getTitle = () => {
    switch (type) {
      case TransactionType.TRANSFER: return t('sendATOSHITitle');
      case TransactionType.PRIVATE_SEND: return t('privacySendTitle');
      case TransactionType.SHIELD: return t('shieldFundsTitle');
      case TransactionType.UNSHIELD: return t('unshieldFundsTitle');
      case TransactionType.BRIDGE_DEPOSIT: return t('depositTitle');
      case TransactionType.BRIDGE_WITHDRAW: return t('withdrawTitle');
      default: return t('confirm');
    }
  };

  // Validate address format for L2 privacy transfer
  const validateAddress = (address: string): boolean => {
    if (!address || !address.trim()) {
      return false;
    }
    
    const trimmed = address.trim();
    
    // For PRIVATE_SEND, the address can be:
    // 1. JSON format: {"ownerPubkey":"...","viewingPubKey":"0x..."}
    // 2. Plain ownerPubkey (bigint as string)
    if (type === TransactionType.PRIVATE_SEND) {
      // Try to parse as JSON first
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          return !!(parsed.ownerPubkey && parsed.viewingPubKey);
        } catch {
          return false;
        }
      }
      // Otherwise, it should be a valid bigint (ownerPubkey)
      try {
        BigInt(trimmed);
        return true;
      } catch {
        return false;
      }
    }
    
    // For other transaction types (TRANSFER, UNSHIELD), validate Ethereum address format
    // Must start with 0x and have 40 hex characters
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethAddressRegex.test(trimmed);
  };

  const handleConfirm = async () => {
    // Shield, Bridge Deposit and Bridge Withdraw do not need a "to" address
    if (!amount) return;
    if (type !== TransactionType.SHIELD && type !== TransactionType.BRIDGE_DEPOSIT && type !== TransactionType.BRIDGE_WITHDRAW && !to) return;
    
    // Validate address format for transactions that require a recipient
    if (type !== TransactionType.SHIELD && type !== TransactionType.BRIDGE_DEPOSIT && type !== TransactionType.BRIDGE_WITHDRAW) {
      if (!validateAddress(to)) {
        onShowToast?.(t('invalidAddressFormat'));
        return;
      }
    }
    
    setIsProcessing(true);

    try {
      // Simulate ZK-Proof generation for privacy tasks
      if (activeAsset === AssetType.PRIVATE || type === TransactionType.SHIELD || type === TransactionType.UNSHIELD) {
        for (let i = 0; i <= 100; i += 5) {
          setProofProgress(i);
          await new Promise(r => setTimeout(r, 80));
        }
      }
      // For bridge deposit and other transactions, the loading state will be maintained
      // until the transaction is confirmed (handled in onConfirm)

      await onConfirm(amount, to); // Wait for the transaction to complete
    } catch (error) {
      console.error('Transaction failed:', error);
      // Keep processing state to show error
    } finally {
      setIsProcessing(false);
      setProofProgress(0);
    }
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
            {isDark ? t('zkProofDesc') : t('evmTxDesc')}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-purple-400' : 'text-blue-600'}`}>{t('amount')}</label>
            <div className={`relative rounded-2xl border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'} focus-within:ring-2 ${isDark ? 'focus-within:ring-purple-500/30' : 'focus-within:ring-blue-500/20'}`}>
              <input 
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty string, digits, and one decimal point
                  if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
                    setAmount(value);
                  }
                }}
                placeholder="0.00"
                className="w-full bg-transparent p-4 text-lg font-bold outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs opacity-40 uppercase">
                ATOSHI
              </span>
            </div>
          </div>

          {/* Shield type: funds are deposited into your own privacy pool, so no recipient input is needed */}
          {type === TransactionType.SHIELD || type === TransactionType.BRIDGE_DEPOSIT || type === TransactionType.BRIDGE_WITHDRAW ? (
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                {type === TransactionType.BRIDGE_DEPOSIT 
                  ? t('depositTo') 
                  : type === TransactionType.BRIDGE_WITHDRAW
                  ? t('withdrawTo')
                  : t('depositTo')
                }
              </span>
              <p className="mt-1 text-xs">
                {type === TransactionType.BRIDGE_DEPOSIT 
                  ? t('yourL2Address')
                  : type === TransactionType.BRIDGE_WITHDRAW
                  ? t('yourL1Address')
                  : t('yourPrivacyPool')
                }
              </p>
            </div>
          ) : (
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-purple-400' : 'text-blue-600'}`}>
                {type === TransactionType.PRIVATE_SEND ? t('receiverPrivacyAddress') : t('receiverAddress')}
              </label>
              <div className={`relative rounded-2xl border transition-all ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'} focus-within:ring-2 ${isDark ? 'focus-within:ring-purple-500/30' : 'focus-within:ring-blue-500/20'}`}>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={
                    type === TransactionType.PRIVATE_SEND
                      ? t('pasteOrScan')
                      : (isDark ? '0x_...' : '0x...')
                  }
                  className="w-full bg-transparent p-4 pr-14 text-xs font-medium mono outline-none"
                />
                {/* Scan button — only appears during privacy transfers */}
                {type === TransactionType.PRIVATE_SEND && (
                  <button
                    onClick={() => setShowScanner(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                    title={t('scanQRCode')}
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
                  {t('generatingZKProof')}
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
            disabled={isProcessing || !amount || (type !== TransactionType.SHIELD && type !== TransactionType.BRIDGE_DEPOSIT && type !== TransactionType.BRIDGE_WITHDRAW && !to)}
            onClick={handleConfirm}
            className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
              isDark ? 'privacy-gradient text-white' : 'public-gradient text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {t('processing')}
              </>
            ) : (
              <>
                {t('confirm')} {getTitle()}
                <ShieldCheck size={20} />
              </>
            )}
          </button>
          
          <p className="text-[10px] text-center opacity-30 px-6 leading-relaxed">
            {type === TransactionType.BRIDGE_DEPOSIT
              ? t('transferForPrivacy')
              : type === TransactionType.BRIDGE_WITHDRAW
              ? t('bridgeWithdrawDesc')
              : isDark 
                ? t('privacyTxDesc')
                : t('publicTxDesc')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;
