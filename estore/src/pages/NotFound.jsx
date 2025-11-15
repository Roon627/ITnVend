import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="flex min-h-[80vh] flex-col items-center justify-center gap-6 bg-gradient-to-br from-rose-50 via-white to-sky-50 px-6 py-16 text-center text-slate-700">
      <div className="rounded-3xl border border-white/70 bg-white/90 px-10 py-12 shadow-2xl shadow-rose-100/70">
        <div className="text-[11px] font-semibold uppercase tracking-[0.5em] text-rose-400">Nothing to see here</div>
        <h1 className="mt-4 text-4xl font-black text-slate-900">404 — Wrong door</h1>
        <p className="mt-3 max-w-xl text-sm text-slate-500">
          Either you typed the wrong thing, or you’ve uncovered the secret entrance to ITnVend HQ.
          Security bots sent us a postcard, but they’re letting you off with a warning.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/market"
            className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600"
          >
            Back to the market
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-6 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50"
          >
            Report this to ops
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-400">
          Tip: if you’re poking around, at least bring snacks for the devs.
        </p>
      </div>
    </section>
  );
}
