import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeadset, FaShieldAlt } from 'react-icons/fa';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-rose-100 bg-white/85 py-6 backdrop-blur">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-sm text-rose-400 md:flex-row">
        <div className="text-center md:text-left">
          <span className="font-semibold">© {year} ITnVend.</span> Serving customers in the Maldives and worldwide with a smile.
        </div>
        <div className="flex flex-col items-center gap-3 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-sky-400 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5"
            >
              <FaHeadset aria-hidden="true" />
              Talk to a human
            </Link>
            <Link
              to="/contact?topic=issue"
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
            >
              <FaShieldAlt aria-hidden="true" />
              Report an issue
            </Link>
          </div>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center justify-center gap-3 md:ml-4">
              <li>
                <Link to="/vendor-onboarding" className="font-semibold text-rose-500 hover:text-rose-400">
                  Become a vendor
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="font-semibold text-rose-500 hover:text-rose-400">
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/use" className="font-semibold text-rose-500 hover:text-rose-400">
                  Use Policy
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
