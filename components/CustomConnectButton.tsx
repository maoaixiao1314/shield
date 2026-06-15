import React, { useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { useAccount, useConnect } from 'wagmi';
import { useTranslation } from 'react-i18next';

interface CustomConnectButtonProps {
  className?: string;
  onShowToast?: (message: string) => void;  // Callback to show toast from parent
}

const CustomConnectButton: React.FC<CustomConnectButtonProps> = ({ className = '', onShowToast }) => {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (isConnected) {
      console.log('[CustomConnect] Already connected');
      return;
    }

    // Debug info
    console.log('[CustomConnect] === Connection Debug Info ===');
    console.log('[CustomConnect] window.ethereum exists:', !!(window as any).ethereum);
    console.log('[CustomConnect] Available connectors count:', connectors.length);
    console.log('[CustomConnect] Connectors:', connectors.map(c => ({ id: c.id, name: c.name, type: c.type })));
    
    setIsConnecting(true);
    try {
      // Find the injected connector (MetaMask/injected wallet)
      const injectedConnector = connectors.find(c => c.id === 'injected' || c.name?.toLowerCase().includes('metamask'));
      
      if (!injectedConnector) {
        console.error('[CustomConnect] ❌ No injected connector found');
        console.error('[CustomConnect] Available connectors:', connectors.map(c => ({ id: c.id, name: c.name })));
        
        // Check if ethereum is available
        if (!(window as any).ethereum) {
          onShowToast?.(t('noWalletDetected'));
        } else {
          onShowToast?.(t('walletConnectionFailed'));
        }
        
        setIsConnecting(false);
        return;
      }

      console.log('[CustomConnect] ✅ Found connector:', injectedConnector.name);
      console.log('[CustomConnect] Connector details:', {
        id: injectedConnector.id,
        name: injectedConnector.name,
        type: injectedConnector.type
      });
      
      // Use wagmi's connect function - it will properly trigger the wallet connection
      console.log('[CustomConnect] Calling connect()...');
      await connect({ connector: injectedConnector });
      
      console.log('[CustomConnect] ✅ Connection initiated successfully');
      // wagmi will automatically update isConnected state after successful connection
    } catch (error) {
      console.error('[CustomConnect] ❌ Connection failed:', error);
      console.error('[CustomConnect] Error message:', error instanceof Error ? error.message : String(error));
      
      setIsConnecting(false);
      
      // Show user-friendly error message
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
  };

  if (isConnected) {
    return null; // Don't show button when already connected
  }

  return (
    <button
      onClick={handleConnect}
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
        </>
      )}
    </button>
  );
};

export default CustomConnectButton;
