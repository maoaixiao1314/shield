import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - html5-qrcode has no types
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  onError?: (msg: string) => void;
  onClose: () => void;
}

/** Overlay-style QR code scanner (used by Alice to scan Bob's receiving code when transferring) */
const QRCodeScanner: React.FC<Props> = ({ onScan, onError, onClose }) => {
  const containerId = 'qr-scanner-container';
  const scannerRef = useRef<any>(null);
  const [status, setStatus] = useState<'init' | 'scanning' | 'error'>('init');
  const [errMsg, setErrMsg] = useState<string>('');

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    html5QrCode
      .start(
        { facingMode: 'environment' }, // rear camera
        { fps: 10, qrbox: 250 },
        (decodedText: string) => {
          // stop after a single successful scan
          html5QrCode.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {
          // callback for per-frame scan failures; fires constantly under normal conditions, so it is ignored
        }
      )
      .then(() => setStatus('scanning'))
      .catch((e: any) => {
        const msg = e?.message || String(e);
        setStatus('error');
        setErrMsg(msg);
        onError?.(msg);
      });

    return () => {
      try {
        if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {});
        scannerRef.current?.clear().catch(() => {});
      } catch {}
    };
  }, [onScan, onError]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-sm w-full">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-zinc-200 font-bold">Scan Bob's Privacy Receiving Code</h3>
          <button
            onClick={() => {
              try { scannerRef.current?.stop().catch(() => {}); } catch {}
              onClose();
            }}
            className="text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {status === 'init' && (
          <p className="text-zinc-500 text-xs">Requesting camera permission...</p>
        )}
        {status === 'error' && (
          <div className="text-red-400 text-xs">
            <p>Unable to start camera:</p>
            <p className="mt-1">{errMsg}</p>
            <p className="mt-2 text-zinc-500">Tip: the browser must be on https / localhost, otherwise permission is denied</p>
          </div>
        )}

        <div id={containerId} className="rounded-lg overflow-hidden bg-black" />

        {status === 'scanning' && (
          <p className="mt-3 text-zinc-500 text-xs text-center">Point the camera at Bob's QR code</p>
        )}
      </div>
    </div>
  );
};

export default QRCodeScanner;
