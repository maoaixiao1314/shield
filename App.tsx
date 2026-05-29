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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<TransactionType | null>(null);
  
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
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
    recoverNotesFromChain,
  } = useWallet();

  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecoverNotes = async () => {
    if (!ensureConnectedAndOnL2()) return;
    if (!wallet.privacyKeys?.isInitialized) {
      alert('请先初始化隐私身份(点 "Setup Privacy")');
      return;
    }
    setIsRecovering(true);
    try {
      const recovered = await recoverNotesFromChain();
      alert(`扫描完成,恢复了 ${recovered.length} 笔 Note`);
    } catch (e: any) {
      console.error('恢复失败:', e);
      alert('恢复失败: ' + (e?.message || e));
    } finally {
      setIsRecovering(false);
    }
  };

  // 通用前置检查: 已连接 + 在 Atoshi L2 链上. 返回 false 表示不通过(已弹提示)
  const ensureConnectedAndOnL2 = (): boolean => {
    if (!isConnected) {
      alert('请先连接钱包！');
      return false;
    }
    if (!isOnAtoshiL2) {
      const ok = window.confirm(
        `您当前钱包不在 Atoshi L2 链上 (current chain: ${currentChainId})。\n\n` +
        `Atoshi 隐私交易只在 L2 (chain ${atoshiL2.id}) 上运行。\n` +
        `是否切换到 Atoshi L2?\n\n` +
        `(如果 MetaMask 提示"未知网络",请同意添加并切换)`
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
    if (!ensureConnectedAndOnL2()) return;
    try {
      await initializePrivacy();
      alert('隐私密钥初始化成功！');
    } catch (error) {
      console.error('初始化失败:', error);
      alert('初始化失败，请重试: ' + (error as any)?.message);
    }
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
        default:
          throw new Error('未知操作类型');
      }

      setTransactions([tx, ...transactions]);
      closeModal();
      alert('交易成功！');
    } catch (error) {
      console.error('交易失败:', error);
      alert(`交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 如果没有连接钱包，显示连接按钮
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Atoshi Privacy Wallet</h1>
          <p className="text-slate-600 mb-8">连接钱包开始使用隐私功能</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  // 构建 wallet 对象
  const walletState = {
    ...wallet,
    address: address || '',
    // 强制显示 ATOSHI(不信钱包返回的 symbol — MetaMask 等会用户自定义链时存了不准的 symbol)
    publicBalance: balance ? `${parseFloat(balance.formatted).toFixed(4)} ATOSHI` : '0 ATOSHI'
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-slate-50 text-slate-900' : 'bg-zinc-950 text-zinc-100'}`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col shadow-2xl relative overflow-hidden bg-inherit">
        <div className={`absolute top-[-10%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 transition-all duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-blue-400' : 'bg-purple-600'}`} />
        <div className={`absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 transition-all duration-700 ${activeAsset === AssetType.PUBLIC ? 'bg-indigo-300' : 'bg-pink-600'}`} />

        <Header wallet={walletState} activeAsset={activeAsset} />

        {/* 全局警告 banner: 连了钱包但不在 Atoshi L2 链上, 一直显示直到切链 */}
        {isConnected && !isOnAtoshiL2 && (
          <div className="mx-4 mt-2 z-10 bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-xs">
            <p className="font-bold text-amber-400">⚠️ 当前不在 Atoshi L2 链上</p>
            <p className="text-amber-200/80 mt-1">
              当前 chain: {currentChainId} → 需要切换到 Atoshi L2 (chain {atoshiL2.id})
            </p>
            <p className="text-amber-200/60 mt-2 text-[10px]">
              💡 如果 MetaMask 没有添加过 Atoshi L2,点下面按钮会自动添加.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  // 用 wallet_addEthereumChain 强制添加并切链
                  // 这个比 useSwitchChain 更可靠:
                  //   useSwitchChain 在链不存在时会失败,而这个会先添加再切
                  if (!(window as any).ethereum) return alert('未检测到钱包扩展');
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
                    alert('添加失败: ' + (e?.message || e));
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-400"
              >
                ➕ 添加并切换到 Atoshi L2
              </button>
              <button
                onClick={() => switchChain && switchChain({ chainId: atoshiL2.id })}
                className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700"
                title="仅切换 (链已添加过用这个)"
              >
                切换
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
                transactions={transactions.filter(t => [TransactionType.TRANSFER, TransactionType.SHIELD, TransactionType.UNSHIELD].includes(t.type))} 
                onAction={handleAction}
              />
            ) : (
              !wallet.privacyKeys.isInitialized ? (
                <SetupPrivacy wallet={walletState} onInitialize={handleInitializePrivacy} />
              ) : (
                <>
                  {/* 跨设备恢复入口: 从链上扫所有 Deposit 事件,用 viewingKey 解密属于本人的 Note */}
                  <div className="mb-4 flex justify-center">
                    <button
                      onClick={handleRecoverNotes}
                      disabled={isRecovering}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {isRecovering ? '⏳ 扫描链上 Note...' : '🔄 从链上恢复 Note'}
                    </button>
                  </div>
                  <PrivateDashboard
                    wallet={walletState}
                    transactions={transactions.filter(t => [TransactionType.PRIVATE_SEND, TransactionType.SHIELD, TransactionType.UNSHIELD].includes(t.type))}
                    onAction={handleAction}
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
