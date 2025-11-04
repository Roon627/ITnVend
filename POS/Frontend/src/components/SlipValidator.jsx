import { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

export default function SlipValidator() {
  const toast = useToast();
  const [transactionId, setTransactionId] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setFileName(selected ? selected.name : '');
    setResult(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!transactionId.trim()) {
      toast.push('Enter the transaction ID to validate.', 'warning');
      return;
    }
    if (!expectedAmount.toString().trim()) {
      toast.push('Enter the expected payment amount.', 'warning');
      return;
    }
    if (!file) {
      toast.push('Upload the payment slip image first.', 'warning');
      return;
    }
    setProcessing(true);
    setResult(null);
    try {
      const response = await api.validateSlip(transactionId.trim(), expectedAmount.toString().trim(), file);
      setResult(response);
      const overallMatch = response.match && (response.amountMatch !== false);
      toast.push(overallMatch ? 'Slip checked successfully.' : 'Slip checked. Review the details.', overallMatch ? 'success' : 'info');
    } catch (err) {
      console.error('Slip validation failed', err);
      setResult(null);
      toast.push(err?.message || 'Failed to validate slip.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const formatAmount = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '—';
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <label htmlFor="transactionId" className="block text-sm font-semibold text-slate-600">
            Transaction ID
          </label>
          <input
            id="transactionId"
            name="transactionId"
            type="text"
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            placeholder="Enter bank transfer reference"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="expectedAmount" className="block text-sm font-semibold text-slate-600">
            Expected amount
          </label>
          <input
            id="expectedAmount"
            name="expectedAmount"
            type="text"
            inputMode="decimal"
            value={expectedAmount}
            onChange={(event) => setExpectedAmount(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            placeholder="e.g. 1,250.00"
          />
          <p className="text-xs text-slate-400">Use commas or decimals as printed on the slip.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="slipFile" className="block text-sm font-semibold text-slate-600">
            Payment slip (image or PDF)
          </label>
          <input
            id="slipFile"
            name="slipFile"
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600"
          />
          {fileName && <p className="text-xs text-slate-400">Selected: {fileName}</p>}
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={processing}
        >
          {processing ? 'Checking…' : 'Validate Slip'}
        </button>
      </form>

      {result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 space-y-1 text-sm font-semibold">
            {result.match ? (
              <div className="text-emerald-600">✅ Reference matches</div>
            ) : (
              <div className="text-rose-600">❌ Reference mismatch</div>
            )}
            {result.amountMatch === null ? (
              <div className="text-amber-600">ℹ️ Amount not detected</div>
            ) : result.amountMatch ? (
              <div className="text-emerald-600">✅ Amount matches</div>
            ) : (
              <div className="text-amber-600">⚠️ Amount mismatch</div>
            )}
          </div>
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold">Confidence:</dt>
              <dd>{Number.isFinite(result.confidence) ? `${result.confidence.toFixed(2)}%` : '—'}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold">Expected amount:</dt>
              <dd>{formatAmount(result.expectedAmount)}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold">Detected amount:</dt>
              <dd>{formatAmount(result.detectedAmount)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Extracted text:</dt>
              <dd>
                <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                  {result.extractedText || '(no text found)'}
                </pre>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
