/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import resolveMediaUrl from '../lib/media';

const SettingsContext = createContext();

export function useSettings() {
  return useContext(SettingsContext);
}

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  MVR: 'MVR',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  INR: '₹',
};

const INVALID_LOGO_VALUES = new Set(['0', 'null', 'undefined', 'false']);
const DEFAULT_FAVICON = '/images/logo.png';

const sanitizeLogoValue = (value) => {
  if (!value) return '';
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (INVALID_LOGO_VALUES.has(trimmed.toLowerCase())) return '';
  return trimmed;
};

const pickBrandLogo = (settings) =>
  sanitizeLogoValue(
    settings?.logo_url ||
      settings?.outlet?.logo_url ||
      settings?.branding?.logo_url ||
      settings?.brand?.logo_url ||
      ''
  );

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    outlet: {
      currency: 'MVR',
      gst_rate: 0.0,
    },
    email: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings');
      setSettings(response);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      // Keep default settings on error - don't retry automatically
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const currencyCode = settings?.outlet?.currency || settings?.currency || 'MVR';
  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const brandLogoUrl = useMemo(() => {
    const candidate = pickBrandLogo(settings);
    if (!candidate) return null;
    return resolveMediaUrl(candidate);
  }, [
    settings?.logo_url,
    settings?.outlet?.logo_url,
    settings?.branding?.logo_url,
    settings?.brand?.logo_url
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const href = brandLogoUrl || DEFAULT_FAVICON;
    const ensureLink = (selector, relValue) => {
      let link = document.querySelector(selector);
      if (!link) {
        link = document.createElement('link');
        link.rel = relValue;
        document.head.appendChild(link);
      }
      link.href = href;
    };
    const updateMeta = (selector, attr) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, href);
    };
    ensureLink("link[rel*='icon']", 'icon');
    ensureLink("link[rel='apple-touch-icon']", 'apple-touch-icon');
    updateMeta("meta[name='msapplication-TileImage']", 'content');
    updateMeta("meta[property='og:image']", 'content');
    updateMeta("meta[name='twitter:image']", 'content');
  }, [brandLogoUrl]);

  const formatCurrency = (amount, options = {}) => {
    try {
      const val = Number(amount ?? 0);
      // Detect if there are any cents (non-zero fractional part up to 2 decimals)
      const cents = Math.round(Math.abs((val - Math.trunc(val)) * 100));
      const hasCents = cents > 0;
      const fractionDigits = options.minimumFractionDigits ?? (hasCents ? 2 : 0);

      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'symbol',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
        ...options,
      }).format(val);
    } catch (err) {
      console.warn('Falling back to manual currency formatting', err);
      // Fallback if Intl doesn't support the code
      const val = Number(amount ?? 0);
      const cents = Math.round(Math.abs((val - Math.trunc(val)) * 100));
      const hasCents = cents > 0;
      return `${currencySymbol} ${hasCents ? val.toFixed(2) : Math.trunc(val)}`;
    }
  };

  const value = {
    settings,
    loading,
    currencyCode,
    currencySymbol,
    brandLogoUrl,
    formatCurrency,
    refreshSettings: fetchSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
