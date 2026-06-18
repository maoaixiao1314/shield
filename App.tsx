import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetType, Transaction, TransactionType } from './types';
import Header from './components/Header';
import AssetToggle from './components/AssetToggle';
import PublicDashboard from './components/PublicDashboard';
import PrivateDashboard from './components/PrivateDashboard';
import ActionModal from './components/ActionModal';
import SetupPrivacy from './components/SetupPrivacy';
import Toast from './components/Toast';
import CustomConnectButton from './components/CustomConnectButton';
import { useAccount, useBalance, useChainId, useSwitchChain } from 'wagmi';
import { atoshiL2 } from './wagmi.config';
import { useWallet } from './hooks/useWallet';
import { Shield } from 'lucide-react';
import { formatErrorForDisplay } from './utils/error-parser';

const App: React.FC = () => {
  const { t } = useTranslation();
  const [activeAsset, setActiveAsset] = useState<AssetType>(AssetType.PUBLIC);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<TransactionType | null>(null);
  
  const { address, isConnected } = useAccount();
  // Always query L2 balance regardless of which chain MetaMask is currently on.
  // Without `chainId: atoshiL2.id`, useBalance follows the wallet's current
  // chain — so right after a Bridge L1→L2 (when the wallet was switched to L1
  // to sign bridgeAsset), the hook returns the L1 balance instead of L2,
  // showing 0 even though funds have already auto-claimed onto L2.
  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    chainId: atoshiL2.id,
  });
  
  // Initialize transactions from localStorage (isolated by address)
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (!address) return [];
    const storageKey = `transactions_${address.toLowerCase()}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse transactions from localStorage:', e);
        return [];
      }
    }
    return [];
  });
  
  // Reload transactions when address changes
  useEffect(() => {
    if (!address) {
      setTransactions([]);
      return;
    }
    
    const storageKey = `transactions_${address.toLowerCase()}`;
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      try {
        const loadedTransactions = JSON.parse(stored);
        console.log(`[Address Change] Loaded ${loadedTransactions.length} transactions for ${address}`);
        setTransactions(loadedTransactions);
      } catch (e) {
        console.error('Failed to parse transactions from localStorage:', e);
        setTransactions([]);
      }
    } else {
      console.log(`[Address Change] No transactions found for ${address}`);
      setTransactions([]);
    }
  }, [address]);
  
  // Log balance changes
  useEffect(() => {
    if (balance) {
      console.log('[Balance Update] Balance changed:', {
        formatted: balance.formatted,
        symbol: balance.symbol,
        value: balance.value.toString(),
        timestamp: new Date().toISOString()
      });
    }
  }, [balance]);
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isOnAtoshiL2 = currentChainId === atoshiL2.id;
  
  const {
    wallet,
    initializePrivacy,
    shield,
    privateSend,
    unshield,
    transfer,
    bridgeDeposit,        // L1 -> L2 cross-chain bridge
    bridgeWithdraw,       // L2 -> L1 cross-chain bridge
    recoverNotesFromChain,
    localNotes,                  // ⭐ New: local Note list (for UI rendering)
    refreshPrivateState,         // ⭐ New: call after any Note change to refresh the UI
  } = useWallet();

  const [isRecovering, setIsRecovering] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const handleRecoverNotes = async () => {
    if (!ensureConnectedAndOnL2()) return;
    if (!wallet.privacyKeys?.isInitialized) {
      setToastMessage(t('initializePrivacyFirst'));
      setShowToast(true);
      return;
    }
    setIsRecovering(true);
    try {
      const recovered = await recoverNotesFromChain();
      setToastMessage(`${t('scanComplete')} ${recovered.length} ${t('note')}`);
      setShowToast(true);
    } catch (e: any) {
      console.error('Recovery failed:', e);
      setToastMessage(`${t('recoveryFailed')}: ` + (e?.message || e));
      setShowToast(true);
    } finally {
      setIsRecovering(false);
    }
  };

  // General precondition check: connected + on the Atoshi L2 chain. Returns false if it fails (a prompt has already been shown)
  const ensureConnectedAndOnL2 = (): boolean => {
    if (!isConnected) {
      setToastMessage(t('pleaseConnectFirst'));
      setShowToast(true);
      return false;
    }
    if (!isOnAtoshiL2) {
      // Use native wallet API for better compatibility (especially on Android WebView)
      const switchToL2 = async () => {
        if (!(window as any).ethereum) {
          setToastMessage(t('noWalletDetected'));
          setShowToast(true);
          return;
        }
        try {
          const l2ChainIdHex = '0x' + atoshiL2.id.toString(16);
          // Try to switch first
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: l2ChainIdHex }],
          });
        } catch (switchError: any) {
          // If chain doesn't exist (code 4902), add it first
          if (switchError.code === 4902) {
            try {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x' + atoshiL2.id.toString(16),
                  chainName: atoshiL2.name,
                  nativeCurrency: atoshiL2.nativeCurrency,
                  rpcUrls: ['https://l2-rpc1-testnet.atoshi.org'],
                  blockExplorerUrls: ['http://52.76.210.218:4001'],
                }],
              });
            } catch (addError: any) {
              setToastMessage(`${t('failedToAdd')}: ` + (addError?.message || addError));
              setShowToast(true);
            }
          } else {
            setToastMessage(`Switch failed: ${switchError?.message || switchError}`);
            setShowToast(true);
          }
        }
      };
      
      const ok = window.confirm(
        `${t('notOnAtoshiL2')} (${t('currentChain')}: ${currentChainId}).\n\n` +
        `${t('needSwitchToL2')} ${atoshiL2.id}).\n` +
        `Switch to Atoshi L2?\n\n` +
        `(If MetaMask shows "Unknown network", please approve adding and switching)`
      );
      if (ok) {
        switchToL2();
      }
      return false;
    }
    return true;
  };

  const handleAction = (type: TransactionType) => {
    if (!ensureConnectedAndOnL2()) return;
    setActiveAction(type);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveAction(null);
  };

  const handleInitializePrivacy = async () => {
    if (!ensureConnectedAndOnL2()) {
      throw new Error(t('connectAndSwitchL2'));
    }
    await initializePrivacy();
  };

  // Clear transaction history for current address
  const handleClearHistory = () => {
    if (!address) return;
    setTransactions([]);
    const storageKey = `transactions_${address.toLowerCase()}`;
    localStorage.removeItem(storageKey);
  };

  const onConfirmAction = async (amount: string, to: string) => {
    try {
      let tx: Transaction;

      switch (activeAction) {
        case TransactionType.TRANSFER:
          tx = await transfer(amount, to);
          break;
        case TransactionType.SHIELD:
          tx = await shield(amount);
          break;
        case TransactionType.UNSHIELD:
          tx = await unshield(amount, to);
          break;
        case TransactionType.PRIVATE_SEND:
          tx = await privateSend(amount, to);
          break;
        case TransactionType.BRIDGE_DEPOSIT:
          tx = await bridgeDeposit(amount);
          break;
        case TransactionType.BRIDGE_WITHDRAW:
          tx = await bridgeWithdraw(amount);
          break;
        default:
          throw new Error('Unknown action type');
      }

      // Add new transaction and limit to MAX count
      const MAX_TRANSACTIONS = 200;
      const updatedTransactions = [tx, ...transactions].slice(0, MAX_TRANSACTIONS);
      setTransactions(updatedTransactions);
      
      // Persist to localStorage (isolated by address)
      if (address) {
        const storageKey = `transactions_${address.toLowerCase()}`;
        localStorage.setItem(storageKey, JSON.stringify(updatedTransactions));
      }
      closeModal();
      
      console.log('[Balance Refresh] Transaction completed, starting balance refresh...');
      console.log('[Balance Refresh] Current balance before refetch:', balance);
      
      // Refresh balance after successful transaction
      await refetchBalance();
      
      console.log('[Balance Refresh] Balance refetched successfully');
      console.log('[Balance Refresh] New balance after refetch:', balance);
      
      // Show success toast instead of alert
      console.log('[Transaction] Showing success toast...');
      setToastMessage(t('transactionSuccess'));
      setShowToast(true);
    } catch (error) {
      console.error('Transaction failed:', error);
      
      // Use friendly error parser
      const displayMessage = formatErrorForDisplay(error);
      
      setToastMessage(displayMessage);
      setShowToast(true);
    }
  };

  // Build the wallet object
  const walletState = {
    ...wallet,
    address: address || '',
    // Force-display ATOSHI (don't trust the symbol returned by the wallet — MetaMask and others store an inaccurate symbol for user-defined chains)
    publicBalance: balance ? `${parseFloat(balance.formatted).toFixed(4)} ATOSHI` : '0 ATOSHI'
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-slate-50 text-slate-900' : 'bg-zinc-950 text-zinc-100'}`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col shadow-2xl relative overflow-hidden bg-inherit">
        <div className={`absolute top-[-10%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 transition-all duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-blue-400' : 'bg-purple-600'}`} />
        <div className={`absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 transition-all duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-indigo-300' : 'bg-pink-600'}`} />

        {/* Wallet connection banner - shown only when not connected */}
        {!isConnected && (
          <div className="mx-4 mt-4 z-10 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-2xl p-6 backdrop-blur-sm">
            <div className="text-center space-y-4">
              <div className="inline-block p-4 bg-blue-500/20 rounded-full">
                <Shield size={32} className="text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-1">{t('welcomeTitle')}</h2>
                <p className="text-xs opacity-70">{t('welcomeSubtitle')}</p>
              </div>
              <div className="flex justify-center pt-2">
                <CustomConnectButton onShowToast={(message) => {
                  setToastMessage(message);
                  setShowToast(true);
                }} />
              </div>
            </div>
          </div>
        )}

        <Header wallet={walletState} activeAsset={activeAsset} />

        {/* Global warning banner: wallet connected but not on the Atoshi L2 chain, shown continuously until the chain is switched */}
        {isConnected && !isOnAtoshiL2 && (
          <div className="mx-4 mt-2 z-10 bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-xs">
            <p className="font-bold text-amber-400">⚠️ {t('notOnAtoshiL2')}</p>
            <p className="text-amber-200/80 mt-1">
              {t('currentChain')}: {currentChainId} → {t('needSwitchToL2')} {atoshiL2.id})
            </p>
            <p className="text-amber-200/60 mt-2 text-[10px]">
              {t('addNetworkTip')}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  if (!(window as any).ethereum) {
                    setToastMessage(t('noWalletDetected'));
                    setShowToast(true);
                    return;
                  }
                  try {
                    await (window as any).ethereum.request({
                      method: 'wallet_addEthereumChain',
                      params: [{
                        chainId: '0x' + atoshiL2.id.toString(16),
                        chainName: atoshiL2.name,
                        nativeCurrency: atoshiL2.nativeCurrency,
                        rpcUrls: ['https://l2-rpc1-testnet.atoshi.org'],
                        blockExplorerUrls: ['http://52.76.210.218:4001'],
                      }],
                    });
                  } catch (e: any) {
                    setToastMessage(`${t('failedToAdd')}: ` + (e?.message || e));
                    setShowToast(true);
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-400"
              >
                {t('addAndSwitch')}
              </button>
              <button
                onClick={() => switchChain && switchChain({ chainId: atoshiL2.id })}
                className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700"
                title="Switch only (use this if the chain has already been added)"
              >
                {t('switch')}
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 px-6 pt-4 pb-8 z-10">
          <AssetToggle activeAsset={activeAsset} setActiveAsset={setActiveAsset} />
          
          <div className="mt-8">
            {activeAsset === AssetType.PUBLIC ? (
              <PublicDashboard 
                wallet={walletState} 
                transactions={transactions.filter(t => [
                  TransactionType.TRANSFER, 
                  TransactionType.SHIELD, 
                  TransactionType.UNSHIELD,
                  TransactionType.BRIDGE_DEPOSIT,
                  TransactionType.BRIDGE_WITHDRAW
                ].includes(t.type))} 
                onAction={handleAction}
                onClearHistory={handleClearHistory}
              />
            ) : (
              !wallet.privacyKeys.isInitialized ? (
                <SetupPrivacy wallet={walletState} onInitialize={handleInitializePrivacy} onShowToast={(message) => {
                  setToastMessage(message);
                  setShowToast(true);
                }} />
              ) : (
                <>
                  {/* Cross-device recovery entry point: scan all Deposit events on chain and use the viewingKey to decrypt Notes belonging to the user */}
                  <div className="mb-4 flex justify-center">
                    <button
                      onClick={handleRecoverNotes}
                      disabled={isRecovering}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {isRecovering ? t('scanningNotes') : t('recoverNotesFromChain')}
                    </button>
                  </div>
                  <PrivateDashboard
                    wallet={walletState}
                    transactions={transactions.filter(t => [TransactionType.PRIVATE_SEND, TransactionType.SHIELD, TransactionType.UNSHIELD].includes(t.type))}
                    notes={localNotes}
                    onAction={handleAction}
                    onClearHistory={handleClearHistory}
                    onShowToast={(message) => {
                      setToastMessage(message);
                      setShowToast(true);
                    }}
                  />
                </>
              )
            )}
          </div>
        </main>

        {activeAction && (
          <ActionModal 
            isOpen={modalOpen} 
            onClose={closeModal} 
            type={activeAction} 
            activeAsset={activeAsset}
            onConfirm={onConfirmAction}
            onShowToast={(message) => {
              setToastMessage(message);
              setShowToast(true);
            }}
          />
        )}
        
        {/* Toast notification */}
        <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
      </div>
    </div>
  );
};

export default App;
