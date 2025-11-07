import { useState } from 'react';
import SlipValidator from '../components/SlipValidator';

export default function ValidateSlip() {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-24">
        <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/50 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">VALIDATE</span>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Validate Payment Slip</h1>
                <p className="text-sm text-muted-foreground">Upload a bank transfer slip and confirm it matches the provided transaction reference.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SlipValidator onFileSelected={(f, url) => { setFile(f); setFileUrl(url); }} />
          </div>

          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sticky top-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Uploaded slip</h3>
              <div className="w-full rounded-md overflow-hidden bg-slate-50 flex items-center justify-center p-3">
                {file && file.type?.startsWith('image/') && fileUrl ? (
                  <img src={fileUrl} alt="Uploaded slip" className="w-full h-48 object-contain" />
                ) : file ? (
                  <div className="text-sm text-slate-500">Preview not available for this file type.</div>
                ) : (
                  <div className="text-sm text-slate-400">No file uploaded yet</div>
                )}
              </div>
              {file && (
                <div className="mt-3 text-xs text-slate-600">{file.name}</div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
