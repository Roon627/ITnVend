import React, { useEffect, useState } from 'react';

export default function ReconcileModal({ open, onClose, onSubmit, initialValues }) {
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      setInvoiceId(initialValues.invoiceId ? String(initialValues.invoiceId) : '');
      setAmount(initialValues.amount != null ? String(initialValues.amount) : '');
      if (initialValues.method) setMethod(initialValues.method);
      if (initialValues.reference) setReference(initialValues.reference);
    } else {
      setInvoiceId('');
      setAmount('');
      setMethod('cash');
      setReference('');
    }
  }, [open, initialValues]);

  if (!open) return null;

  const submit = () => {
    const payload = {
      invoiceId: invoiceId || null,
      amount: parseFloat(amount) || 0,
      method,
      reference
    };
    onSubmit && onSubmit(payload);
    // lightweight local reset
    setInvoiceId(''); setAmount(''); setMethod('cash'); setReference('');
    onClose && onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Reconcile / Enter Payment</h3>
          <button onClick={onClose} type="button" className="text-gray-500">✕</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium">Invoice ID (optional)</label>
            <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Amount</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Reference / Notes</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 border rounded">Cancel</button>
          <button onClick={submit} type="button" className="px-4 py-2 bg-blue-600 text-white rounded">Submit</button>
        </div>
      </div>
    </div>
  );
}
