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
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#14171b", light: "#ffffff" },
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
    <div className="qr-frame">
      <canvas ref={canvasRef} width={size} height={size} aria-label={`QR code for ${value}`} role="img" />
    </div>
  );
}
