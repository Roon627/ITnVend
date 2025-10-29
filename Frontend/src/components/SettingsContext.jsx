import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

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
    } catch (err) {
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
    formatCurrency,
    refreshSettings: fetchSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
