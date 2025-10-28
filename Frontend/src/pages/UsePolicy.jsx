import React from 'react';

export default function UsePolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-6">
        <section className="bg-white rounded-lg p-8 shadow mb-6">
          <h1 className="text-3xl font-bold">Use Policy</h1>
          <p className="text-sm text-gray-600 mt-2">This page contains both Global and Maldives-specific use policies. Please read the sections relevant to your region.</p>
        </section>

        <section className="bg-white rounded-lg p-6 shadow mb-6">
          <h2 className="text-2xl font-semibold mb-2">Global Use Policy</h2>
          <p className="text-sm text-gray-700">Users must use the service lawfully and not engage in abusive or fraudulent activities. Prohibited uses include attempting to circumvent security, distributing malware, or using the service for illegal commerce.</p>
          <ul className="list-disc pl-6 mt-3 text-sm text-gray-700">
            <li>Do not attempt unauthorized access.</li>
            <li>Respect intellectual property and local law.</li>
            <li>Be honest in communications and orders.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-2xl font-semibold mb-2">Maldives Use Policy (Maldives-specific)</h2>
          <p className="text-sm text-gray-700">In the Maldives, users are expected to comply with local regulations and customs. We reserve the right to refuse service for activities that violate local laws or community standards.</p>
          <p className="text-sm text-gray-700 mt-2">For specific legal questions about using our services in the Maldives, contact our support team.</p>
        </section>
      </div>
    </div>
  );
}
