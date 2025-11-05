import React from "react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-blue-50 py-12">
      <div className="max-w-4xl mx-auto px-6">
        <section className="bg-white/70 backdrop-blur-lg rounded-2xl shadow-md p-8 mb-8 border border-white/40">
          <h1 className="text-3xl font-semibold text-slate-800">
            🛡️ Privacy Policy
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            This page explains how we protect your information both globally and
            locally in the Maldives. We keep it clear, honest, and as short as
            possible — because privacy shouldn’t read like a mystery novel.
          </p>
        </section>

        <section className="bg-white/60 backdrop-blur-md rounded-xl shadow p-8 mb-8 border border-white/30">
          <h2 className="text-2xl font-semibold text-slate-800 mb-3">
            🌍 Global Privacy Policy
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            We collect only the data we need to provide smooth, secure service —
            nothing more, nothing less. All data is encrypted in transit and
            protected behind strict access controls.
          </p>

          <ul className="list-disc list-inside mt-4 space-y-1 text-slate-600 text-sm">
            <li>
              <strong>Data Controller:</strong> ITnVend
            </li>
            <li>
              <strong>Collected Data:</strong> name, email, phone, company, order
              history
            </li>
            <li>
              <strong>Purpose:</strong> to process orders, provide quotations,
              and deliver customer support
            </li>
            <li>
              <strong>Security:</strong> encrypted transfers (HTTPS) and limited
              employee access
            </li>
          </ul>

          <p className="text-slate-600 text-sm mt-4">
            We retain your data only for as long as needed to serve you or meet
            legal requirements. No surprise marketing, no third-party reselling.
          </p>
        </section>

        <section className="bg-white/60 backdrop-blur-md rounded-xl shadow p-8 border border-white/30">
          <h2 className="text-2xl font-semibold text-slate-800 mb-3">
            🇲🇻 Maldives Privacy Policy
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            For users in the Maldives, we follow local best practices for data
            protection and handle personal information lawfully, fairly, and
            transparently.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            We process your information only for the purposes you consent to,
            and we will never share it with anyone outside of ITnVend or our
            verified service partners without your approval.
          </p>

          <p className="text-slate-600 text-sm mt-3">
            If you have questions or concerns about how your data is managed,
            reach out anytime at{" "}
            <a
              href="mailto:privacy@itnvend.com"
              className="text-pink-600 hover:underline"
            >
              privacy@itnvend.com
            </a>{" "}
            or through your profile settings under{" "}
            <strong>Help → Contact Support</strong>.
          </p>
        </section>

        <footer className="text-center mt-12 text-xs text-slate-400">
          © 2025 ITnVend — Every click protected, every smile encrypted.
        </footer>
      </div>
    </div>
  );
}
