import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import SlipValidator from '../components/SlipValidator';

export default function Slips() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', source: '', status: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activeView, setActiveView] = useState('review');
  const [validateFile, setValidateFile] = useState(null);
  const [validateFileUrl, setValidateFileUrl] = useState(null);
  const viewTabs = [
    { id: 'review', label: 'Review Slips' },
    { id: 'validate', label: 'Validate Slip' },
  ];
  const handleFileSelected = useCallback((fileObj, url) => {
    setValidateFile(fileObj);
    setValidateFileUrl((prev) => {
      if (prev && prev !== url) {
        URL.revokeObjectURL(prev);
      }
      return url || null;
    });
  }, []);
  useEffect(() => () => {
    if (validateFileUrl) {
      URL.revokeObjectURL(validateFileUrl);
    }
  }, [validateFileUrl]);
  const validationSummary = detail && detail.validation_result && typeof detail.validation_result === 'object'
    ? detail.validation_result
    : null;

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const resp = await api.get('/slips', { params: { page, per_page: perPage, ...filters } });
      setItems(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err) {
      console.error('Failed to fetch slips', err);
    } finally {
      setListLoading(false);
    }
  }, [filters, page, perPage]);

  useEffect(() => {
    if (activeView !== 'review') return;
    fetchList();
  }, [activeView, fetchList]);

  const detailId = detail?.id;
  const detailStatus = detail?.status;

  useEffect(() => {
    if (activeView !== 'review') return undefined;
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setDetailLoading(true);
        const d = await api.get(`/slips/${selectedId}`);
        if (!cancelled) setDetail(d || null);
      } catch (e) {
        console.error('Failed to fetch slip detail', e);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeView, selectedId]);

  useEffect(() => {
    if (activeView !== 'review') return undefined;
    if (!detailId || detailStatus !== 'processing') return undefined;
    const interval = window.setInterval(async () => {
      try {
        const updated = await api.get(`/slips/${detailId}`);
        setDetail(updated || null);
        if (updated?.status && updated.status !== 'processing') {
          window.clearInterval(interval);
          await fetchList();
        }
      } catch (err) {
        console.error('Failed to refresh slip detail', err);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeView, detailId, detailStatus, fetchList]);

  const handleSlipPersisted = useCallback(() => {
    fetchList();
  }, [fetchList]);

  const handleFilterApply = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setPage(1);
    await fetchList();
  };

  const pages = useMemo(() => Math.max(1, Math.ceil((total || 0) / perPage)), [total, perPage]);

  return (
    <div className="p-6 md:p-8 lg:p-10 bg-background min-h-[80vh]">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl bg-white p-6 shadow-sm mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">SLIPS</div>
              <h1 className="text-2xl font-bold text-foreground">Payment Slip Workspace</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Review slips uploaded by customers or validate a new payment without leaving this page.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {viewTabs.map((tab) => {
              const isActive = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveView(tab.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-border bg-white text-muted-foreground hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeView === 'review' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
          <div>
            <form onSubmit={handleFilterApply} className="rounded-2xl border border-border bg-surface p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="col-span-1 md:col-span-1">
                  <label className="text-xs text-muted-foreground">From</label>
                  <input type="date" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1" />
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="text-xs text-muted-foreground">To</label>
                  <input type="date" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1" />
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="text-xs text-muted-foreground">Source</label>
                  <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1">
                    <option value="">All</option>
                    <option value="pos">POS</option>
                    <option value="website">Website</option>
                  </select>
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1">
                    <option value="">All</option>
                    <option value="processing">Processing</option>
                    <option value="pending">Pending</option>
                    <option value="validated">Validated</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">Apply</button>
                <button type="button" onClick={() => { setFilters({ date_from: '', date_to: '', source: '', status: '' }); setPage(1); fetchList(); }} className="rounded-full border border-border px-3 py-2 text-sm">Reset</button>
                <div className="ml-auto text-sm text-muted-foreground">Total: {total}</div>
              </div>
            </form>

            <div className="space-y-3">
                {listLoading ? (
                  <div className="grid grid-cols-1 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="animate-pulse p-4 bg-white rounded-2xl border border-border">
                        <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                        <div className="h-3 bg-slate-200 rounded w-1/2 mb-1" />
                        <div className="h-3 bg-slate-200 rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-6 bg-white rounded-2xl shadow-sm">No slips found.</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it) => (
                      <button key={it.id} type="button" onClick={() => setSelectedId(it.id)} className={`w-full text-left rounded-xl p-3 bg-white border ${selectedId === it.id ? 'border-primary/60 shadow' : 'border-border'} flex items-center justify-between`}>
                        <div>
                          <div className="font-semibold text-sm text-foreground">{it.filename || `Slip #${it.id}`}</div>
                          <div className="text-xs text-muted-foreground">{new Date(it.created_at).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{it.uploaded_by_name || it.uploaded_by || '—'} • {it.source}</div>
                        </div>
                        <div className={`text-xs font-semibold uppercase tracking-wide ${it.status === 'validated' ? 'text-emerald-600' : it.status === 'failed' ? 'text-rose-600' : it.status === 'processing' ? 'text-amber-600' : 'text-slate-500'}`}>
                          {it.status}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

              <div className="flex items-center gap-2 mt-4">
                <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border border-border">Prev</button>
                <div className="text-sm text-muted-foreground">Page {page} / {pages}</div>
                <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="px-3 py-1 rounded border border-border">Next</button>
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="ml-auto rounded border border-border px-2 py-1 text-sm">
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>

          <aside className="sticky top-6">
            <div className="rounded-2xl bg-white p-4 border border-border shadow-sm w-full">
              {detail ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">{detail.filename || `Slip #${detail.id}`}</div>
                  {detailLoading && <div className="text-xs text-muted-foreground">Refreshing...</div>}
                  <div className="text-xs text-muted-foreground">Uploaded: {new Date(detail.created_at).toLocaleString()}</div>
                  <div className="mt-2 w-full h-56 bg-slate-50 rounded overflow-hidden flex items-center justify-center">
                    {detail.url ? (
                      <img src={detail.url} alt="Slip preview" className="max-h-full w-full object-contain" />
                    ) : (
                      <div className="text-sm text-muted-foreground">Preview not available</div>
                    )}
                  </div>

                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">OCR Confidence</div>
                    <div className="font-semibold">{detail.ocr_confidence ?? '—'}</div>
                  </div>

                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="font-semibold capitalize">{detail.status}</div>
                    {detail.status === 'processing' && (
                      <div className="text-xs text-muted-foreground mt-1">OCR is running; this card will refresh automatically.</div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground">Extracted text</div>
                    <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs bg-slate-50 p-2 rounded mt-1">{detail.ocr_text || '(none)'}</pre>
                  </div>

                  {validationSummary && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="text-sm font-semibold text-foreground">Auto validation</div>
                      {'transactionId' in validationSummary && validationSummary.transactionId && (
                        <div>Transaction ID match: {validationSummary.match === true ? 'Yes' : validationSummary.match === false ? 'No' : 'Not available'}</div>
                      )}
                      {'amountMatch' in validationSummary && validationSummary.amountMatch != null && (
                        <div>Amount match: {validationSummary.amountMatch ? 'Yes' : 'No'}</div>
                      )}
                      {'detectedAmount' in validationSummary && validationSummary.detectedAmount != null && (
                        <div>Detected amount: {validationSummary.detectedAmount}</div>
                      )}
                      {'expectedAmount' in validationSummary && validationSummary.expectedAmount != null && (
                        <div>Expected amount: {validationSummary.expectedAmount}</div>
                      )}
                      {validationSummary.error && (
                        <div className="text-rose-600">Error: {validationSummary.error}</div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <a target="_blank" rel="noreferrer" href={detail.url || '#'} className="flex-1 text-center rounded-full border border-border px-3 py-2 text-sm">Open file</a>
                  </div>

                  <div className="pt-3 border-t border-border mt-2 space-y-2">
                    <div className="text-sm font-semibold">Staff actions</div>
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        if (!detail) return;
                        try {
                          setDetailLoading(true);
                          await api.patch(`/slips/${detail.id}`, { status: 'validated' });
                          await fetchList();
                          const updated = await api.get(`/slips/${detail.id}`);
                          setDetail(updated);
                        } catch (e) {
                          console.error('Failed to mark validated', e);
                        } finally { setDetailLoading(false); }
                      }} className="flex-1 rounded-full bg-emerald-600 text-white px-3 py-2 text-sm">Mark Validated</button>

                      <button onClick={async () => {
                        if (!detail) return;
                        try {
                          setDetailLoading(true);
                          await api.patch(`/slips/${detail.id}`, { status: 'failed' });
                          await fetchList();
                          const updated = await api.get(`/slips/${detail.id}`);
                          setDetail(updated);
                        } catch (e) {
                          console.error('Failed to mark failed', e);
                        } finally { setDetailLoading(false); }
                      }} className="flex-1 rounded-full bg-rose-600 text-white px-3 py-2 text-sm">Mark Failed</button>
                    </div>
                    <div>
                      <button onClick={async () => {
                        if (!detail) return;
                        try {
                          setDetailLoading(true);
                          await api.patch(`/slips/${detail.id}`, { status: 'pending', validation_result: { requested_review: true } });
                          await fetchList();
                          const updated = await api.get(`/slips/${detail.id}`);
                          setDetail(updated);
                        } catch (e) {
                          console.error('Failed to request review', e);
                        } finally { setDetailLoading(false); }
                      }} className="w-full rounded-full border border-border px-3 py-2 text-sm">Request manual review</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Select a slip to preview details.</div>
              )}
            </div>
          </aside>
        </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6">
            <div className="lg:col-span-1 space-y-6">
              <SlipValidator
                onFileSelected={handleFileSelected}
                onSlipPersisted={handleSlipPersisted}
                showInlinePreview={false}
              />
            </div>
            <aside className="sticky top-6">
              <div className="rounded-2xl bg-white p-4 border border-border shadow-sm w-full">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Uploaded slip</h3>
                <div className="w-full rounded-md overflow-hidden bg-slate-50 flex items-center justify-center p-3">
                  {validateFile && validateFile.type?.startsWith('image/') && validateFileUrl ? (
                    <img src={validateFileUrl} alt="Uploaded slip preview" className="w-full h-48 object-contain" />
                  ) : validateFile ? (
                    <div className="text-sm text-slate-500">Preview not available for this file type.</div>
                  ) : (
                    <div className="text-sm text-slate-400">No file uploaded yet</div>
                  )}
                </div>
                {validateFile && (
                  <div className="mt-3 text-xs text-muted-foreground break-all">{validateFile.name}</div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
