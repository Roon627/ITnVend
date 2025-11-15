import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-slate-50 px-6 py-16 text-center text-slate-700">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-100 bg-white px-10 py-12 shadow-2xl shadow-indigo-100/70">
        <div className="text-[11px] font-semibold uppercase tracking-[0.5em] text-indigo-400">Route not found</div>
        <h1 className="mt-4 text-4xl font-black text-slate-900">404 — Wrong hallway</h1>
        <p className="mt-3 text-sm text-slate-500">
          Either the link is old, or you just tripped a motion sensor trying to sneak into a POS screen that does not
          exist. Security is chuckling, but let&apos;s get you back to safety.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/pos"
            className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-600"
          >
            Back to POS
          </Link>
          <Link
            to="/help"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200 px-6 py-2 text-sm font-semibold text-indigo-500 hover:bg-indigo-50"
          >
            Ping support
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-400">Pro tip: stick to the menu unless you enjoy paperwork.</p>
      </div>
    </div>
  );
}
