"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * QR rendering happens in the browser so the encoded value never reaches a
 * third-party image service. The payload for a payment identity is a plain
 * https link, never a note or a key.
 */
export function QrCode({ value, size = 208 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!canvasRef.current) return;
    // Render at device resolution and let CSS own the layout size. A 208px
    // canvas on a 2x or 3x phone display is visibly soft, and a blurry QR is a
    // scanning problem rather than a cosmetic one.
    const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const canvas = canvasRef.current;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    QRCode.toCanvas(canvasRef.current, value, {
      width: Math.round(size * ratio),
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111318", light: "#ffffff" },
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return <p className="tiny muted">Could not render the QR code. Use the link instead.</p>;
  }
  return (
    <div className="qr-shell">
      <div className="qr-frame">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          aria-label={`QR code for ${value}`}
          role="img"
        />
      </div>
    </div>
  );
}
