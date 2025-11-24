import { Link } from 'react-router-dom';

const recoverySteps = [
  { title: '1. Check the URL', hint: 'Typos happen. Make sure the address is spelled correctly.' },
  { title: '2. Jump back home', hint: 'Head back to the POS hub and re-open the module.' },
  { title: '3. Ask the crew', hint: 'If this keeps happening, ping support and we will patch the route.' },
];

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-8 h-64 w-64 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="w-full rounded-[32px] border border-white/10 bg-white/10 p-10 text-center shadow-2xl shadow-indigo-900/40 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-200">Off the mapped route</p>
          <h1 className="mt-4 text-5xl font-black leading-tight text-white sm:text-6xl">
            <span className="bg-gradient-to-r from-cyan-300 via-indigo-200 to-pink-200 bg-clip-text text-transparent">
              404
            </span>{' '}
            This aisle doesn&apos;t exist
          </h1>
          <p className="mt-4 text-base text-slate-200">
            The screen you tried to reach isn&apos;t wired up in ITnVend just yet. Maybe it moved, maybe it never existed.
            Either way, let&apos;s guide you back to somewhere useful.
          </p>

          <div className="mt-10 grid gap-4 text-left md:grid-cols-3">
            {recoverySteps.map((step) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm shadow-lg shadow-black/10"
              >
                <p className="font-semibold text-indigo-100">{step.title}</p>
                <p className="mt-1 text-slate-200">{step.hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 text-sm font-semibold uppercase tracking-wide text-slate-900 sm:flex-row sm:justify-center">
            <Link
              to="/pos"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/90 px-6 py-3 text-slate-900 shadow shadow-black/10 transition hover:-translate-y-0.5 hover:bg-white"
            >
              Back to POS
            </Link>
            <Link
              to="/help"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-6 py-3 text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Ping support
            </Link>
          </div>
          <p className="mt-6 text-xs uppercase tracking-widest text-slate-200">
            Pro tip: bookmark the screens you visit the most and skip the labyrinth.
          </p>
        </div>
      </div>
    </div>
  );
}
