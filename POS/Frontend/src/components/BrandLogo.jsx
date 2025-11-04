import React, { useMemo } from 'react';
import { useSettings } from './SettingsContext';
import resolveMediaUrl from '../lib/media';

function computeInitials(source) {
  if (!source) return 'IT';
  const trimmed = String(source).trim();
  if (!trimmed) return 'IT';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!words.length) return trimmed.slice(0, 2).toUpperCase();
  const initials = words.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  return initials || trimmed.slice(0, 2).toUpperCase();
}

export default function BrandLogo({ size = 40, className = '', square = true }) {
  const { settings } = useSettings();
  const outletName = settings?.outlet?.name || settings?.outlet_name || 'ITnVend';
  const logoUrl = useMemo(() => {
    const candidate = settings?.logo_url || settings?.outlet?.logo_url || settings?.branding?.logo_url;
    return resolveMediaUrl(candidate);
  }, [settings?.logo_url, settings?.outlet?.logo_url, settings?.branding?.logo_url]);

  const dimensionStyle = useMemo(() => ({ width: size, height: size }), [size]);
  const fallbackInitials = useMemo(() => computeInitials(outletName), [outletName]);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${outletName} logo`}
        className={`object-contain ${square ? 'rounded-md border border-slate-200 bg-white' : ''} ${className}`.trim()}
        style={dimensionStyle}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-md bg-gradient-to-br from-teal-400 to-teal-600 text-white font-bold ${className}`.trim()}
      style={dimensionStyle}
      aria-label={`${outletName} logo placeholder`}
    >
      {fallbackInitials}
    </div>
  );
}
