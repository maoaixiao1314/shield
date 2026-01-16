
import React, { useState } from 'react';
import { WalletState, PrivacyKeys } from '../types';
import { Fingerprint, Loader2, Sparkles, Binary, Key, ChevronRight } from 'lucide-react';

interface SetupPrivacyProps {
  wallet: WalletState;
  onComplete: (keys: PrivacyKeys) => void;
}

const SetupPrivacy: React.FC<SetupPrivacyProps> = ({ wallet, onComplete }) => {
  const [step, setStep] = useState<'start' | 'signing' | 'deriving' | 'success'>('start');
  const [progress, setProgress] = useState(0);

  const startDerivation = async () => {
    setStep('signing');
    await new Promise(r => setTimeout(r, 1200)); // Simulate signing delay
    
    setStep('deriving');
    for (let i = 0; i <= 100; i += 4) {
      setProgress(i);
      await new Promise(r => setTimeout(r, 50));
    }

    const derivedKeys: PrivacyKeys = {
      spendingKey: 'sk_atos_' + Math.random().toString(16).slice(2, 24),
      viewingKey: 'vk_atos_' + Math.random().toString(16).slice(2, 24),
      publicAddress: 'zk_atos_' + wallet.address.slice(2, 10) + '...' + Math.random().toString(36).slice(2, 6),
      isInitialized: true
    };

    setStep('success');
    setTimeout(() => onComplete(derivedKeys), 1500);
  };

  return (
    <div className="space-y-6 py-4 animate-in fade-in duration-500">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 text-center space-y-4">
        <div className="relative inline-block">
          <div className="p-5 bg-purple-500/10 rounded-full text-purple-400">
            {step === 'deriving' ? <Loader2 size={40} className="animate-spin" /> : <Fingerprint size={40} />}
          </div>
          <div className="absolute -top-1 -right-1 bg-yellow-400 p-1.5 rounded-full text-black">
            <Sparkles size={12} />
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight">Activate Privacy Layer</h2>
          <p className="text-xs text-zinc-500 px-4 leading-relaxed">
            Deterministically derive your ZK-Keys using your ETH address. 
            No mnemonic needed — just one signature.
          </p>
        </div>

        {step === 'start' && (
          <button 
            onClick={startDerivation}
            className="w-full py-4 privacy-gradient text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
          >
            Sign to Derive Keys
            <ChevronRight size={18} />
          </button>
        )}

        {(step === 'signing' || step === 'deriving') && (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tighter text-zinc-400">
              <span className="flex items-center gap-1.5">
                {step === 'signing' ? 'Awaiting Signature...' : 'Poseidon Hashing...'}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full privacy-gradient transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex gap-2 justify-center">
               <div className={`w-2 h-2 rounded-full ${step === 'signing' ? 'bg-purple-500 animate-pulse' : 'bg-purple-900'}`} />
               <div className={`w-2 h-2 rounded-full ${step === 'deriving' ? 'bg-pink-500 animate-pulse' : 'bg-pink-900'}`} />
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-2 text-green-400 flex flex-col items-center gap-2 animate-in zoom-in duration-300">
             <div className="p-3 bg-green-500/10 rounded-full">
               <Key size={32} />
             </div>
             <span className="text-sm font-black uppercase tracking-widest">Keys Secured</span>
          </div>
        )}
      </div>

      <div className="bg-zinc-950 border border-zinc-800/50 rounded-2xl p-4">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-3 flex items-center gap-2">
          <Binary size={12} /> Architecture Mapping
        </h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">1</div>
            <div className="flex-1 text-[11px] text-zinc-400">ETH Master Key (0x...f321)</div>
          </div>
          <div className="h-4 w-px bg-zinc-800 ml-3" />
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-purple-900 flex items-center justify-center text-[10px] font-bold text-purple-300">2</div>
            <div className="flex-1 text-[11px] text-zinc-400">EIP-712 Signature (Atoshi v1)</div>
          </div>
          <div className="h-4 w-px bg-zinc-800 ml-3" />
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-pink-900 flex items-center justify-center text-[10px] font-bold text-pink-300">3</div>
            <div className="flex-1 text-[11px] text-zinc-400 font-bold">Privacy Seed (Poseidon Output)</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupPrivacy;
