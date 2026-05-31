import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - qrcode library has no types
import QRCode from 'qrcode';

interface Props {
  data: string;
  size?: number;
}

/** Render an arbitrary string into a QR code (canvas). Used to show Bob his own receiving code. */
const QRCodeDisplay: React.FC<Props> = ({ data, size = 200 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    QRCode.toCanvas(
      canvasRef.current,
      data,
      {
        width: size,
        margin: 2,
        color: { dark: '#a78bfa', light: '#0a0a0a' }, // purple on black
        errorCorrectionLevel: 'M',
      },
      (e: any) => {
        if (e) setErr(e.message || String(e));
      }
    );
  }, [data, size]);

  if (err) return <div className="text-red-400 text-xs">QR generation failed: {err}</div>;
  return <canvas ref={canvasRef} className="rounded-lg" />;
};

export default QRCodeDisplay;
