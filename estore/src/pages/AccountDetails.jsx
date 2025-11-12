import { useState, useEffect } from 'react';
import { useSettings } from '../components/SettingsContext';
import { useToast } from '../components/ToastContext';

export default function AccountDetails() {
  const { getAccountTransferDetails, saveAccountTransferDetails } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState({ bank_name: '', account_name: '', account_number: '' });
  useEffect(() => {
    const details = getAccountTransferDetails();
    if (details) setForm({
      bank_name: details.bank_name || '',
      account_name: details.account_name || '',
      account_number: details.account_number || '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      bank_name: form.bank_name.trim(),
      account_name: form.account_name.trim(),
      account_number: form.account_number.trim(),
    };
    const res = await saveAccountTransferDetails(payload);
    if (res.ok) {
      toast.push('Account details saved (locally and to server if available).', 'success');
    } else {
      toast.push('Saved locally but server save may have failed.', 'warning');
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Account details (transfer)</h1>
      <form onSubmit={handleSave} className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Bank name</label>
          <input name="bank_name" value={form.bank_name} onChange={handleChange} className="mt-2 w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Account name</label>
          <input name="account_name" value={form.account_name} onChange={handleChange} className="mt-2 w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Account number</label>
          <input name="account_number" value={form.account_number} onChange={handleChange} className="mt-2 w-full rounded-md border px-3 py-2" />
        </div>
        <div className="flex gap-3">
          <button className="btn-primary" type="submit">Save details</button>
        </div>
      </form>
    </div>
  );
}
