import React from 'react';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 bg-white border-t py-6">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
        <div className="text-sm text-slate-600">© {year} ITnVend — Serving customers in the Maldives and worldwide.</div>
        <nav className="mt-3 md:mt-0">
          <ul className="flex gap-4 text-sm">
            <li><a href="/vendor-onboarding" className="text-slate-600 hover:underline">Become a Vendor</a></li>
            <li><a href="/privacy" className="text-slate-600 hover:underline">Privacy Policy</a></li>
            <li><a href="/use" className="text-slate-600 hover:underline">Use Policy</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
