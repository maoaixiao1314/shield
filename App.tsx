
import React, { useState, useEffect } from 'react';
import { AssetType, Transaction, TransactionType, WalletState } from './types';
import Header from './components/Header';
import AssetToggle from './components/AssetToggle';
import PublicDashboard from './components/PublicDashboard';
import PrivateDashboard from './components/PrivateDashboard';
import ActionModal from './components/ActionModal';
import { Shield, Send, ArrowDownCircle, History, Zap } from 'lucide-react';

const INITIAL_STATE: WalletState = {
  publicBalance: '1.245 ETH',
  privateBalance: '3500.00 ATOS',
  address: '0x71C7...f321',
  privateKeyAddress: 'zk_atos_9vR3...kL92'
};

const INITIAL_TXS: Transaction[] = [
  {
    id: '1',
    type: TransactionType.TRANSFER,
    amount: '0.1 ETH',
    asset: 'ETH',
    timestamp: Date.now() - 3600000,
    from: '0x71C7...f321',
    to: '0x8821...a1b2',
    status: 'completed',
    txHash: '0xab12...cdef'
  },
  {
    id: '2',
    type: TransactionType.SHIELD,
    amount: '1000 ATOS',
    asset: 'ATOS',
    timestamp: Date.now() - 7200000,
    from: '0x71C7...f321',
    to: 'Shield Contract',
    status: 'completed',
    txHash: '0xfe98...3321'
  },
  {
    id: '3',
    type: TransactionType.PRIVATE_SEND,
    amount: '500 ATOS',
    asset: 'ATOS',
    timestamp: Date.now() - 86400000,
    from: 'zk_atos_9vR3...kL92',
    to: 'zk_atos_p4x8...mZ11',
    status: 'completed',
    nullifier: 'nf_0x82...1a'
  }
];

const App: React.FC = () => {
  const [activeAsset, setActiveAsset] = useState<AssetType>(AssetType.PUBLIC);
  const [wallet, setWallet] = useState<WalletState>(INITIAL_STATE);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TXS);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<TransactionType | null>(null);

  const handleAction = (type: TransactionType) => {
    setActiveAction(type);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveAction(null);
  };

  const onConfirmAction = (amount: string, to: string) => {
    // Simulate updating balances and adding tx
    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: activeAction!,
      amount,
      asset: activeAsset === AssetType.PUBLIC ? 'ETH' : 'ATOS',
      timestamp: Date.now(),
      from: activeAsset === AssetType.PUBLIC ? wallet.address : wallet.privateKeyAddress,
      to,
      status: 'completed',
      txHash: activeAsset === AssetType.PUBLIC ? `0x${Math.random().toString(16).substr(2, 32)}` : undefined,
      nullifier: activeAsset === AssetType.PRIVATE ? `nf_0x${Math.random().toString(16).substr(2, 16)}` : undefined
    };

    setTransactions([newTx, ...transactions]);
    // Logic to decrement/increment balances would go here
    closeModal();
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-slate-50 text-slate-900' : 'bg-zinc-950 text-zinc-100'}`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col shadow-2xl relative overflow-hidden">
        {/* Background blobs for visual flavor */}
        <div className={`absolute top-[-10%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 transition-all duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-blue-400' : 'bg-purple-600'}`} />
        <div className={`absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 transition-all duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-indigo-300' : 'bg-pink-600'}`} />

        <Header wallet={wallet} activeAsset={activeAsset} />

        <main className="flex-1 px-6 pt-4 pb-24 z-10">
          <AssetToggle activeAsset={activeAsset} setActiveAsset={setActiveAsset} />
          
          <div className="mt-8">
            {activeAsset === AssetType.PUBLIC ? (
              <PublicDashboard 
                wallet={wallet} 
                transactions={transactions.filter(t => t.type === TransactionType.TRANSFER || t.type === TransactionType.SHIELD || t.type === TransactionType.UNSHIELD)} 
                onAction={handleAction}
              />
            ) : (
              <PrivateDashboard 
                wallet={wallet} 
                transactions={transactions.filter(t => t.type === TransactionType.PRIVATE_SEND || t.type === TransactionType.SHIELD || t.type === TransactionType.UNSHIELD)} 
                onAction={handleAction}
              />
            )}
          </div>
        </main>

        {/* Bottom Quick Actions (Persistent) */}
        <nav className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md glass-dark px-8 py-4 flex justify-between items-center rounded-t-3xl border-t z-50 ${activeAsset === AssetType.PUBLIC ? 'border-slate-200' : 'border-zinc-800'}`}>
          <button 
             onClick={() => handleAction(activeAsset === AssetType.PUBLIC ? TransactionType.TRANSFER : TransactionType.PRIVATE_SEND)}
             className={`flex flex-col items-center gap-1 transition-transform hover:scale-105 ${activeAsset === AssetType.PUBLIC ? 'text-blue-600' : 'text-purple-400'}`}>
            <div className={`p-3 rounded-2xl ${activeAsset === AssetType.PUBLIC ? 'bg-blue-50' : 'bg-purple-500/10'}`}>
              <Send size={24} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Send</span>
          </button>

          <button 
             onClick={() => handleAction(activeAsset === AssetType.PUBLIC ? TransactionType.SHIELD : TransactionType.UNSHIELD)}
             className={`flex flex-col items-center gap-1 -translate-y-4 transition-transform hover:scale-110`}>
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
