/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { resolveMediaUrl } from '../lib/media';

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

  const logoUrl = useMemo(() => {
    const candidates = [
      settings?.logo_url,
      settings?.outlet?.logo_url,
      settings?.branding?.logo_url,
      settings?.branding?.logo,
      settings?.brand?.logo_url,
      settings?.brand?.logo,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }, [settings]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (!logoUrl) return undefined;
    const resolved = resolveMediaUrl(logoUrl);
    if (!resolved) return undefined;
    const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];
    const previous = rels.map((rel) => {
      let link = document.querySelector(`link[rel='${rel}']`);
      let created = false;
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
        created = true;
      }
      const prevHref = link.getAttribute('href');
      link.href = resolved;
      return { rel, link, prevHref, created };
    });
    return () => {
      previous.forEach(({ link, prevHref, created }) => {
        if (!link) return;
        if (created) {
          link.parentNode?.removeChild(link);
        } else if (prevHref) {
          link.href = prevHref;
        }
      });
    };
  }, [logoUrl]);

  const currencyCode = settings?.outlet?.currency || settings?.currency || 'MVR';
  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;

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
  } catch {
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
    logoUrl,
    currencyCode,
    currencySymbol,
    formatCurrency,
    refreshSettings: fetchSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
