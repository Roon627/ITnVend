import React from 'react';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-rose-100 bg-white/80 py-6 backdrop-blur">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-sm text-rose-400 md:flex-row">
        <div className="text-center md:text-left">
          <span className="font-semibold">© {year} ITnVend.</span> Serving customers in the Maldives and worldwide with a smile.
        </div>
        <nav aria-label="Footer navigation">
          <ul className="flex gap-4">
            <li>
              <a href="/vendor-onboarding" className="font-semibold text-rose-500 hover:text-rose-400">
                Become a Vendor
              </a>
            </li>
            <li>
              <a href="/privacy" className="font-semibold text-rose-500 hover:text-rose-400">
                Privacy
              </a>
            </li>
            <li>
              <a href="/use" className="font-semibold text-rose-500 hover:text-rose-400">
                Use Policy
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
