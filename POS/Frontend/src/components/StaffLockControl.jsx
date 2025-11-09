import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

export default function StaffLockControl({ staffId, initialLocked, onChange }) {
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(!!initialLocked);
  const toast = useToast();

  async function doToggle(lock) {
    if (!window.confirm(lock ? 'Lock this account? This will invalidate active sessions.' : 'Unlock this account?')) return;
    setLoading(true);
    try {
      const path = `/staff/${staffId}/${lock ? 'lock' : 'unlock'}`;
      await api.post(path);
      setLocked(lock);
      toast.push(lock ? 'Account locked' : 'Account unlocked', lock ? 'warning' : 'success');
      if (typeof onChange === 'function') onChange({ id: staffId, locked: lock });
    } catch (err) {
      console.error('Failed to toggle lock', err);
      toast.push(err?.message || 'Failed to update account lock', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      {locked ? (
        <button
          onClick={() => doToggle(false)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
        >
          Unlock
        </button>
      ) : (
        <button
          onClick={() => doToggle(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
        >
          Lock
        </button>
      )}
    </div>
  );
}
