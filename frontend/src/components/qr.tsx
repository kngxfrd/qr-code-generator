import { useEffect, useMemo, useState } from 'react';
import QRCodeStyling, { type DotType, type CornerSquareType, type Options as QRCodeOptions } from 'qr-code-styling';
import type { QRDesign } from '../types';

export const DEFAULT_DESIGN: QRDesign = { foreground: '#000000', background: '#ffffff', pattern: 'square', corners: 'square', frame: 'none', frameLabel: 'SCAN ME', logo: null, logoSize: 30 };

export function qrOptions(payload: string, design: QRDesign, size = 320): QRCodeOptions {
  const patterns: Record<string, DotType> = {
    square: 'square', rounded: 'rounded', dots: 'dots', classy: 'classy', soft: 'classy-rounded', extra: 'extra-rounded',
  };
  const cornerTypes: Record<string, CornerSquareType> = {
    square: 'square', rounded: 'extra-rounded', dot: 'dot',
  };
  return {
    width: size, height: size, type: 'svg', data: payload || 'https://freeqrgenerator.com', margin: 8,
    qrOptions: { errorCorrectionLevel: design.logo ? 'H' : 'Q' },
    backgroundOptions: { color: design.background },
    imageOptions: { crossOrigin: 'anonymous', margin: 5, imageSize: Math.min(Math.max(design.logoSize / 100, 0.12), 0.32), hideBackgroundDots: true },
    dotsOptions: { color: design.foreground, type: patterns[design.pattern] || 'square' },
    cornersSquareOptions: { color: design.foreground, type: cornerTypes[design.corners] || 'square' },
    cornersDotOptions: { color: design.foreground, type: design.corners === 'dot' ? 'dot' : 'square' },
    image: design.logo || undefined,
  };
}

export function useRenderedQr(payload: string, design: QRDesign) {
  const [svg, setSvg] = useState('');
  const safePayload = payload || 'https://freeqrgenerator.com';
  const config = useMemo(() => qrOptions(safePayload, design), [safePayload, design]);
  useEffect(() => {
    let cancelled = false;
    const qr = new QRCodeStyling(config);
    qr.getRawData('svg').then(async (blob) => {
      if (!blob || cancelled) return;
      const value = await blob.text();
      if (!cancelled) setSvg(value);
    }).catch(() => { if (!cancelled) setSvg(''); });
    return () => { cancelled = true; };
  }, [config]);
  return svg;
}

export async function downloadQr(payload: string, design: QRDesign, fileType: 'svg' | 'png' | 'jpeg' = 'png', name = 'free-qr-code') {
  const qr = new QRCodeStyling(qrOptions(payload, design, 1000));
  const blob = await qr.getRawData(fileType);
  if (!blob) throw new Error('Could not render this QR code for download.');
  const extension = fileType === 'jpeg' ? 'jpg' : fileType;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'free-qr-code'}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  if (fileType === 'svg') return blob.text();
  return '';
}

export function QrArtwork({ svg, design, compact = false }: { svg: string; design: QRDesign; compact?: boolean }) {
  const hasFrame = design.frame !== 'none';
  return <div className={`qr-art qr-art-frame-${design.frame} ${compact ? 'qr-art-compact' : ''}`} style={{ backgroundColor: design.background, color: design.foreground }}>
    {svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="QR code preview" /> : <span className="qr-loading">Making your code…</span>}
    {hasFrame && <span className="qr-frame-label">{design.frameLabel || 'SCAN ME'}</span>}
  </div>;
}

export function PhonePreview({ svg, design, title = 'Your QR preview' }: { svg: string; design: QRDesign; title?: string }) {
  return <div className="phone-preview"><div className="phone-meta"><span>LIVE PREVIEW</span><span className="live-dot" /></div><div className="phone-device"><div className="phone-island" /><div className="phone-status"><span>9:41</span><span>••• ▰</span></div><div className="phone-screen-content"><QrArtwork svg={svg} design={design} compact /><small>{title}</small></div><div className="phone-home" /></div><p>Changes show up here as you design.</p></div>;
}
