import React, { useState } from 'react';
import { Wallet, Loader2, ChevronDown } from 'lucide-react';
import { useAccount, useConnect } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { detectWallet, isAtoshiWallet } from '../utils/wallet-detector';

interface CustomConnectButtonProps {
  className?: string;
  onShowToast?: (message: string) => void;  // Callback to show toast from parent
}

const CustomConnectButton: React.FC<CustomConnectButtonProps> = ({ className = '', onShowToast }) => {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletList, setShowWalletList] = useState(false);
  const [hasAutoConnected, setHasAutoConnected] = useState(false);

  // Auto-connect on mount if wallet was previously connected
  React.useEffect(() => {
    if (!isConnected && !hasAutoConnected && !isConnecting) {
      // Check if we're in Atoshi wallet environment
      const isAtoshiEnv = isAtoshiWallet();
      
      if (isAtoshiEnv) {
        // In Atoshi wallet, always use injected connector, ignore localStorage
        console.log('[CustomConnect] 🎯 Atoshi environment detected, using injected connector');
        handleConnect(undefined, true);  // Let auto-detection choose the right connector
      } else {
        // In standard browser, check localStorage for last connected wallet
        const lastConnectedWallet = localStorage.getItem('lastConnectedWallet');
        
        if (lastConnectedWallet) {
          console.log('[CustomConnect] Found previously connected wallet:', lastConnectedWallet);
          // Try to auto-reconnect
          handleConnect(lastConnectedWallet, true);
        } else if ((window as any).ethereum) {
          // If no previous wallet but ethereum provider exists, try auto-connect
          console.log('[CustomConnect] Ethereum provider detected, attempting auto-connect...');
          handleConnect(undefined, true);
        }
      }
      
      setHasAutoConnected(true);
    }
  }, [isConnected, hasAutoConnected, isConnecting]);

  const handleConnect = async (connectorId?: string, silent = false) => {
    if (isConnected) {
      console.log('[CustomConnect] Already connected');
      return;
    }

    // Debug info
    if (!silent) {
      console.log('[CustomConnect] === Connection Debug Info ===');
      console.log('[CustomConnect] window.ethereum exists:', !!(window as any).ethereum);
      console.log('[CustomConnect] Available connectors count:', connectors.length);
      console.log('[CustomConnect] Connectors:', connectors.map(c => ({ id: c.id, name: c.name, type: c.type })));
    }
    
    setIsConnecting(true);
    setShowWalletList(false);
    
    try {
      let targetConnector;
      
      // CRITICAL: Check if we're in Atoshi wallet environment first
      const ethereumProvider = (window as any).ethereum;
      const isAtoshiEnv = isAtoshiWallet();
      
      if (isAtoshiEnv) {
        // In Atoshi wallet, ALWAYS use injected connector, never MetaMask SDK
        console.log('[CustomConnect] 🎯 Running in Atoshi wallet environment');
        targetConnector = connectors.find(c => c.id === 'injected');
        
        if (!targetConnector) {
          console.error('[CustomConnect] ❌ No injected connector found in Atoshi wallet!');
          if (!silent) {
            onShowToast?.('Failed to find wallet connector. Please refresh the page.');
          }
          setIsConnecting(false);
          return;
        }
      } else if (connectorId) {
        // Use specified connector
        targetConnector = connectors.find(c => c.id === connectorId);
        console.log(`[CustomConnect] Using specified connector: ${connectorId}`);
      } else {
        // For non-Atoshi environments, detect wallet type and choose best connector
        if (ethereumProvider) {
          // Use wallet detection utility
          const walletInfo = await detectWallet();
          
          if (walletInfo && walletInfo.type === 'atoshi') {
            console.log('[CustomConnect] ✅ Detected Atoshi wallet via detector');
            targetConnector = connectors.find(c => c.id === 'injected');
          } else if (walletInfo && walletInfo.type === 'metamask') {
            // For MetaMask, prefer the dedicated metaMask connector
            targetConnector = connectors.find(c => c.id === 'metaMask') || 
                             connectors.find(c => c.id === 'injected');
            console.log('[CustomConnect] Using MetaMask connector for:', walletInfo.name);
          } else {
            // For other wallets (Rabby, Trust, etc.), use injected connector
            targetConnector = connectors.find(c => c.id === 'injected');
            console.log('[CustomConnect] Using injected connector for:', walletInfo?.name || 'Unknown wallet');
          }
        }
        
        // Fallback: use the first available connector
        if (!targetConnector && connectors.length > 0) {
          targetConnector = connectors[0];
          console.log('[CustomConnect] Using fallback connector:', targetConnector.id);
        }
      }
      
      if (!targetConnector) {
        console.error('[CustomConnect] ❌ No connector found');
        
        // Check if ethereum is available
        if (!(window as any).ethereum) {
          onShowToast?.(t('noWalletDetected'));
        } else {
          onShowToast?.(t('walletConnectionFailed'));
        }
        
        setIsConnecting(false);
        return;
      }

      console.log('[CustomConnect] ✅ Using connector:', targetConnector.name);
      console.log('[CustomConnect] Connector details:', {
        id: targetConnector.id,
        name: targetConnector.name,
        type: targetConnector.type
      });
      
      // Use wagmi's connect function - it will properly trigger the wallet connection
      if (!silent) {
        console.log('[CustomConnect] Calling connect()...');
      }
      await connect({ connector: targetConnector });
      
      // Save the last connected wallet for auto-reconnect
      // CRITICAL: In Atoshi environment, always save as 'injected' to avoid MetaMask SDK issues
      const walletToSave = isAtoshiEnv ? 'injected' : targetConnector.id;
      localStorage.setItem('lastConnectedWallet', walletToSave);
      
      if (!silent) {
        console.log('[CustomConnect] ✅ Connection initiated successfully');
        console.log('[CustomConnect] Saved wallet:', walletToSave);
      }
      // wagmi will automatically update isConnected state after successful connection
    } catch (error) {
      if (!silent) {
        console.error('[CustomConnect] ❌ Connection failed:', error);
        console.error('[CustomConnect] Error message:', error instanceof Error ? error.message : String(error));
      }
      
      setIsConnecting(false);
      
      // Show user-friendly error message (only in non-silent mode)
      if (!silent) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (
          errorMessage.includes('user rejected') ||
          errorMessage.includes('User rejected') ||
          errorMessage.includes('4001')
        ) {
          console.log('[CustomConnect] User cancelled connection');
          // User cancelled, no need to show alert
        } else if (errorMessage.includes('No Ethereum provider')) {
          onShowToast?.(t('noWalletDetected'));
        } else {
          // Generic error - show simplified message
          const shortError = errorMessage.length > 80 
            ? errorMessage.substring(0, 80) + '...'
            : errorMessage;
          onShowToast?.(`${t('connectionFailed')}: ${shortError}`);
        }
      }
    }
  };

  if (isConnected) {
    return null; // Don't show button when already connected
  }

  // If there are multiple connectors, show a dropdown
  const hasMultipleConnectors = connectors.length > 1;

  return (
    <div className="relative">
      <button
        onClick={() => hasMultipleConnectors ? setShowWalletList(!showWalletList) : handleConnect()}
        disabled={isConnecting || isPending}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl ${className}`}
      >
        {isConnecting || isPending ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            {t('connecting')}
          </>
        ) : (
          <>
            <Wallet size={20} />
            {t('connectWallet')}
            {hasMultipleConnectors && <ChevronDown size={16} />}
          </>
        )}
      </button>

      {/* Wallet selection dropdown */}
      {showWalletList && hasMultipleConnectors && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-[9999]">
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => handleConnect(connector.id)}
              className="w-full px-4 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-3"
            >
              <Wallet size={16} />
              <span>{connector.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Click outside to close dropdown */}
      {showWalletList && (
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={() => setShowWalletList(false)}
        />
      )}
    </div>
  );
};

export default CustomConnectButton;
