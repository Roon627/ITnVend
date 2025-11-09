import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { useToast } from './ToastContext';
import InlineValidationCard from './InlineValidationCard';

export default function SlipValidator({ onFileSelected, showInlinePreview = true, onSlipPersisted } = {}) {
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
    try {
      const url = selected ? URL.createObjectURL(selected) : null;
      if (typeof onFileSelected === 'function') onFileSelected(selected, url);
    } catch {
      // ignore
    }
  };

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    // revoke object URL when file changes or component unmounts to avoid memory leaks
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const detectReferenceFromText = (text, entered) => {
    if (!text) return null;
    // Normalize: uppercase and remove punctuation except alphanumerics
    const tokens = (text || '')
      .replace(/[\r\n]+/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-z0-9-]/g, ''))
      .filter(Boolean);

    if (entered) {
      const normalized = entered.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
      // find exact or close token
      let best = null;
      for (const t of tokens) {
        const tNorm = t.toUpperCase();
        if (!tNorm) continue;
        if (tNorm.includes(normalized) || normalized.includes(tNorm)) {
          best = t;
          break;
        }
      }
      if (best) return best;
    }

    // fallback: longest alphanumeric token (likely a ref)
    let longest = '';
    for (const t of tokens) {
      if (t.length > longest.length) longest = t;
    }
    return longest || null;
  };

  const detectSlipType = (text, confidence = null) => {
    // If OCR confidence is very low, consider it not a slip
    if (typeof confidence === 'number' && confidence < 60) return false;
    if (!text || !text.trim()) return false;
    const s = text.toLowerCase();

    // explicit negative indicators produced by OCR or our other heuristics
    const negativePhrases = [
      'does not contain',
      'no text',
      'no visible',
      'not contain any visible',
      'unable to read',
      'could not',
    ];
    for (const np of negativePhrases) if (s.includes(np)) return false;

    const mustHave = ['deposit', 'transfer', 'transaction', 'amount', 'mvr', 'bank', 'account', 'reference'];
    const negative = ['invoice', 'note', 'photo', 'random'];

    for (const n of negative) if (s.includes(n)) return false;

    // if contains any must-have keywords, consider it a slip
    for (const k of mustHave) {
      if (s.includes(k)) return true;
    }

    // check that OCR produced a reasonable proportion of alphanumeric characters
    const chars = text.replace(/\s+/g, '');
    const alnum = (chars.match(/[A-Za-z0-9]/g) || []).length;
    const ratio = chars.length > 0 ? alnum / chars.length : 0;
    if (chars.length < 20 || ratio < 0.35) return false;

    // number-like pattern detection (amounts) as fallback
    const numberPattern = /\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?\b/;
    if (numberPattern.test(s)) return true;

    return false;
  };

  const parseAmount = (v) => {
    if (v === null || v === undefined) return null;
    const str = String(v).replace(/[\s,]/g, '').replace(/[^0-9.-]/g, '');
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  };

  const checkAmountMatch = (detectedAmount, expectedAmountValue) => {
    const da = parseAmount(detectedAmount);
    const ea = parseAmount(expectedAmountValue);
    if (da === null || ea === null) return null;
    // consider match if within 1.0 of expected (allow small rounding)
    if (Math.abs(da - ea) <= 1.0) return true;
    return false;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedTransactionId = transactionId.trim();
    const normalizedExpected = expectedAmount !== undefined && expectedAmount !== null ? expectedAmount.toString().trim() : '';
    if (!trimmedTransactionId) {
      toast.push('Enter the transaction ID to validate.', 'warning');
      return;
    }
    if (!file) {
      toast.push('Upload the payment slip image first.', 'warning');
      return;
    }
    setProcessing(true);
    setResult(null);
    try {
      const response = await api.validateSlip(trimmedTransactionId, normalizedExpected || undefined, file);
      // basic slip-type detection using OCR text
      const looksLikeSlip = detectSlipType(response?.extractedText || '', response?.confidence);
      if (!looksLikeSlip) {
        // non-blocking toast for non-slip images instead of a blocking alert/modal
        toast.push("Hmm, this doesn't look like a payment slip. Please upload the correct transfer receipt.", 'warning');
        setResult(null);
        setProcessing(false);
        return;
      }

      setResult(response);

      // Persist slip for staff review (non-blocking). Backend will store file and OCR result.
      try {
        api
          .saveSlip(file, {
            transactionId: trimmedTransactionId,
            expectedAmount: normalizedExpected || undefined,
            source: 'pos',
          })
          .then((saveResp) => {
            if (saveResp && saveResp.id) {
              toast.push('Slip uploaded for review.', 'success');
              if (typeof onSlipPersisted === 'function') {
                onSlipPersisted(saveResp);
              }
            }
          })
          .catch((e) => {
            console.debug('Failed to persist slip (non-blocking):', e?.message || e);
          });
      } catch {
        // ignore persistence errors - validation already showed result
      }

      if (response && response.match === false) {
        toast.push('Payment slip does not match the provided reference. Please re-check your slip or reference.', 'error');
      }

      // frontend double-check of amount in addition to backend
      const amountOk = normalizedExpected ? checkAmountMatch(response?.detectedAmount, normalizedExpected) : null;
      if (amountOk === false) {
        // non-blocking toast notifying manual review will follow
        toast.push("Amount doesn't match, but we'll double-check it manually.", 'info');
      }

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
          <p className="text-xs text-slate-400">Ensure the uploaded image clearly shows this reference number.</p>
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

      {showInlinePreview && file && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:w-2/3 rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center p-3">
              {file.type?.startsWith('image/') ? (
                <img src={fileUrl} alt="Payment slip preview" className="max-h-48 w-full object-contain" />
              ) : (
                <div className="text-sm text-slate-500">Preview not available for this file type.</div>
              )}
            </div>

            <div className="w-full md:w-1/3 rounded-lg bg-rose-50/50 border border-rose-100 p-3">
              <h4 className="text-sm font-semibold text-rose-600 mb-2">Reference Test</h4>
              <div className="text-sm text-slate-700 space-y-2">
                <div>
                  <div className="text-xs text-slate-500">Entered</div>
                  <div className="font-mono font-semibold">{transactionId || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Detected</div>
                  <div className="font-mono font-semibold">
                    {result?.detectedReference || detectReferenceFromText(result?.extractedText, transactionId) || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Result</div>
                  <div className={`font-semibold ${result?.match ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {result ? (result.match ? '✅ Match' : '❌ Mismatch') : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (!result.match || !detectSlipType(result?.extractedText || '', result?.confidence)) && (
        <div className="mt-3">
          <InlineValidationCard
            status={!result.match ? 'mismatch' : 'not-slip'}
            confidence={result.confidence}
            extractedText={result.extractedText}
            onReplace={() => {
              // trigger file input replacement
              const input = document.querySelector('input[type=file]');
              if (input) input.click();
            }}
            onRetry={async () => {
              setProcessing(true);
              try {
                const retryTx = transactionId.trim();
                const retryExpected = expectedAmount !== undefined && expectedAmount !== null ? expectedAmount.toString().trim() : '';
                const resp = await api.validateSlip(retryTx, retryExpected || undefined, file);
                setResult(resp);
              } catch (e) {
                console.error('Slip retry failed', e);
                toast.push(e?.message || 'Retry failed', 'error');
              } finally {
                setProcessing(false);
              }
            }}
            onRequestReview={() => toast.push('We will double-check this slip and follow up.', 'info')}
            allowContinue={true}
            onContinue={() => setResult((r) => ({ ...r, overrideContinue: true }))}
          />
        </div>
      )}

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

      {/* analyzing overlay (use shared Modal for consistent spacing) */}
      <Modal open={processing} onClose={() => {}} showFooter={false}>
        <div className="rounded-xl bg-white/90 p-6 flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-rose-300 border-t-rose-500 animate-spin" />
          <div className="text-sm font-medium">Analyzing slip, please wait…</div>
        </div>
      </Modal>
    </div>
  );
}
