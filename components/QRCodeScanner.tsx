import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - html5-qrcode 无 type
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  onError?: (msg: string) => void;
  onClose: () => void;
}

/** 弹层式二维码扫描器 (Alice 转账时扫 Bob 收款码用) */
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
        { facingMode: 'environment' }, // 后置摄像头
        { fps: 10, qrbox: 250 },
        (decodedText: string) => {
          // 成功识别一次就停
          html5QrCode.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {
          // 每帧识别失败的回调,正常情况会一直触发,不处理
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
          <h3 className="text-zinc-200 font-bold">扫描 Bob 的隐私收款码</h3>
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
          <p className="text-zinc-500 text-xs">正在请求摄像头权限...</p>
        )}
        {status === 'error' && (
          <div className="text-red-400 text-xs">
            <p>无法启动摄像头:</p>
            <p className="mt-1">{errMsg}</p>
            <p className="mt-2 text-zinc-500">提示: 浏览器必须 https / localhost, 否则不给权限</p>
          </div>
        )}

        <div id={containerId} className="rounded-lg overflow-hidden bg-black" />

        {status === 'scanning' && (
          <p className="mt-3 text-zinc-500 text-xs text-center">把摄像头对准 Bob 的二维码</p>
        )}
      </div>
    </div>
  );
};

export default QRCodeScanner;
