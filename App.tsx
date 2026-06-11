import React, { useState, useEffect } from 'react';
import { AssetType, Transaction, TransactionType } from './types';
import Header from './components/Header';
import AssetToggle from './components/AssetToggle';
import PublicDashboard from './components/PublicDashboard';
import PrivateDashboard from './components/PrivateDashboard';
import ActionModal from './components/ActionModal';
import SetupPrivacy from './components/SetupPrivacy';
import { History, Send, Shield } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useChainId, useSwitchChain } from 'wagmi';
import { atoshiL2 } from './wagmi.config';
import { useWallet } from './hooks/useWallet';

const App: React.FC = () => {
  const [activeAsset, setActiveAsset] = useState<AssetType>(AssetType.PUBLIC);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<TransactionType | null>(null);
  
  const { address, isConnected } = useAccount();
  const { data: balance, refetch: refetchBalance } = useBalance({ address });
  
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

  const handleRecoverNotes = async () => {
    if (!ensureConnectedAndOnL2()) return;
    if (!wallet.privacyKeys?.isInitialized) {
      alert('Please initialize your privacy identity first (click "Setup Privacy")');
      return;
    }
    setIsRecovering(true);
    try {
      const recovered = await recoverNotesFromChain();
      alert(`Scan complete, recovered ${recovered.length} Note(s)`);
    } catch (e: any) {
      console.error('Recovery failed:', e);
      alert('Recovery failed: ' + (e?.message || e));
    } finally {
      setIsRecovering(false);
    }
  };

  // General precondition check: connected + on the Atoshi L2 chain. Returns false if it fails (a prompt has already been shown)
  const ensureConnectedAndOnL2 = (): boolean => {
    if (!isConnected) {
      alert('Please connect your wallet first!');
      return false;
    }
    if (!isOnAtoshiL2) {
      const ok = window.confirm(
        `Your wallet is not currently on the Atoshi L2 chain (current chain: ${currentChainId}).\n\n` +
        `Atoshi privacy transactions only run on L2 (chain ${atoshiL2.id}).\n` +
        `Switch to Atoshi L2?\n\n` +
        `(If MetaMask shows "Unknown network", please approve adding and switching)`
      );
      if (ok && switchChain) {
        switchChain({ chainId: atoshiL2.id });
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
      // Caller (SetupPrivacy) expects this to throw on failure so it can
      // reset its loading state. Throw a clear error instead of silently
      // returning here, otherwise the UI shows "Keys Secured" after a
      // wallet rejection.
      throw new Error('Please connect your wallet first and switch to the Atoshi L2 chain (chain 67890)');
    }
    // No try/catch here — let SetupPrivacy's own catch handle UI state
    // (it shows an alert + resets back to the "start" step). Wrapping
    // it here was swallowing the error and falsely advancing the wizard
    // to step='success' (the "Keys Secured" green badge) even when the
    // user clicked "reject" on the MetaMask signature prompt.
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
      
      alert('Transaction successful!');
    } catch (error) {
      console.error('Transaction failed:', error);
      alert(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                <h2 className="text-lg font-bold mb-1">Welcome to Atoshi Privacy</h2>
                <p className="text-xs opacity-70">Connect your wallet to access privacy features</p>
              </div>
              <div className="flex justify-center pt-2">
                <ConnectButton />
              </div>
            </div>
          </div>
        )}

        <Header wallet={walletState} activeAsset={activeAsset} />

        {/* Global warning banner: wallet connected but not on the Atoshi L2 chain, shown continuously until the chain is switched */}
        {isConnected && !isOnAtoshiL2 && (
          <div className="mx-4 mt-2 z-10 bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-xs">
            <p className="font-bold text-amber-400">⚠️ Not currently on the Atoshi L2 chain</p>
            <p className="text-amber-200/80 mt-1">
              Current chain: {currentChainId} → need to switch to Atoshi L2 (chain {atoshiL2.id})
            </p>
            <p className="text-amber-200/60 mt-2 text-[10px]">
              💡 If MetaMask has never added Atoshi L2, clicking the button below will add it automatically.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  // Use wallet_addEthereumChain to force-add and switch the chain
                  // This is more reliable than useSwitchChain:
                  //   useSwitchChain fails when the chain doesn't exist, whereas this adds it first and then switches
                  if (!(window as any).ethereum) return alert('No wallet extension detected');
                  try {
                    await (window as any).ethereum.request({
                      method: 'wallet_addEthereumChain',
                      params: [{
                        chainId: '0x' + atoshiL2.id.toString(16),
                        chainName: atoshiL2.name,
                        nativeCurrency: atoshiL2.nativeCurrency,
                        rpcUrls: ['http://52.76.210.218:8123'],
                        blockExplorerUrls: ['http://52.76.210.218:4001'],
                      }],
                    });
                  } catch (e: any) {
                    alert('Failed to add: ' + (e?.message || e));
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-400"
              >
                ➕ Add and switch to Atoshi L2
              </button>
              <button
                onClick={() => switchChain && switchChain({ chainId: atoshiL2.id })}
                className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700"
                title="Switch only (use this if the chain has already been added)"
              >
                Switch
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 px-6 pt-4 pb-24 z-10">
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
                <SetupPrivacy wallet={walletState} onInitialize={handleInitializePrivacy} />
              ) : (
                <>
                  {/* Cross-device recovery entry point: scan all Deposit events on chain and use the viewingKey to decrypt Notes belonging to the user */}
                  <div className="mb-4 flex justify-center">
                    <button
                      onClick={handleRecoverNotes}
                      disabled={isRecovering}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {isRecovering ? '⏳ Scanning Notes on chain...' : '🔄 Recover Notes from chain'}
                    </button>
                  </div>
                  <PrivateDashboard
                    wallet={walletState}
                    transactions={transactions.filter(t => [TransactionType.PRIVATE_SEND, TransactionType.SHIELD, TransactionType.UNSHIELD].includes(t.type))}
                    notes={localNotes}
                    onAction={handleAction}
                    onClearHistory={handleClearHistory}
                  />
                </>
              )
            )}
          </div>
        </main>

        <nav className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md glass-dark px-8 py-4 flex justify-between items-center rounded-t-3xl border-t z-50 ${activeAsset === AssetType.PUBLIC ? 'border-slate-200' : 'border-zinc-800'}`}>
          <button 
             disabled={activeAsset === AssetType.PRIVATE && !wallet.privacyKeys.isInitialized}
             onClick={() => handleAction(activeAsset === AssetType.PUBLIC ? TransactionType.TRANSFER : TransactionType.PRIVATE_SEND)}
             className={`flex flex-col items-center gap-1 transition-all hover:scale-105 disabled:opacity-30 ${activeAsset === AssetType.PUBLIC ? 'text-blue-600' : 'text-purple-400'}`}>
            <div className={`p-3 rounded-2xl ${activeAsset === AssetType.PUBLIC ? 'bg-blue-50' : 'bg-purple-500/10'}`}>
              <Send size={24} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Send</span>
          </button>

          <button 
             disabled={activeAsset === AssetType.PRIVATE && !wallet.privacyKeys.isInitialized}
             onClick={() => handleAction(activeAsset === AssetType.PUBLIC ? TransactionType.SHIELD : TransactionType.UNSHIELD)}
             className={`flex flex-col items-center gap-1 -translate-y-4 transition-all hover:scale-110 disabled:opacity-30`}>
            <div className={`p-5 rounded-full shadow-lg ${activeAsset === AssetType.PUBLIC ? 'public-gradient text-white' : 'privacy-gradient text-white'}`}>
              <Shield size={32} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest mt-1 ${activeAsset === AssetType.PUBLIC ? 'text-blue-600' : 'text-purple-400'}`}>
              {activeAsset === AssetType.PUBLIC ? 'Shield' : 'Unshield'}
            </span>
          </button>

          <button className={`flex flex-col items-center gap-1 transition-transform hover:scale-105 ${activeAsset === AssetType.PUBLIC ? 'text-slate-400' : 'text-zinc-500'}`}>
            <div className={`p-3 rounded-2xl ${activeAsset === AssetType.PUBLIC ? 'bg-slate-100' : 'bg-zinc-800'}`}>
              <History size={24} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">History</span>
          </button>
        </nav>

        {activeAction && (
          <ActionModal 
            isOpen={modalOpen} 
            onClose={closeModal} 
            type={activeAction} 
            activeAsset={activeAsset}
            onConfirm={onConfirmAction}
          />
        )}
      </div>
    </div>
  );
};

export default App;
