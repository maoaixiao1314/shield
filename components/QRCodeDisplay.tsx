import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - qrcode 库无 type
import QRCode from 'qrcode';

interface Props {
  data: string;
  size?: number;
}

/** 把任意字符串渲染成二维码 (canvas). 给 Bob 展示自己收款码用. */
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
        color: { dark: '#a78bfa', light: '#0a0a0a' }, // 紫色 on 黑
        errorCorrectionLevel: 'M',
      },
      (e: any) => {
        if (e) setErr(e.message || String(e));
      }
    );
  }, [data, size]);

  if (err) return <div className="text-red-400 text-xs">QR 生成失败: {err}</div>;
  return <canvas ref={canvasRef} className="rounded-lg" />;
};

export default QRCodeDisplay;
