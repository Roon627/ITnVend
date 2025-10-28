import React from 'react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-6">
        <section className="bg-white rounded-lg p-8 shadow mb-6">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-gray-600 mt-2">This page contains the Global and Maldives-specific privacy policies. Scroll to the section that applies to you.</p>
        </section>

        <section className="bg-white rounded-lg p-6 shadow mb-6">
          <h2 className="text-2xl font-semibold mb-2">Global Privacy Policy</h2>
          <p className="text-sm text-gray-700">We collect and process personal data necessary to provide our services, such as contact details and order information. We use industry-standard safeguards to protect your data. We retain data only as long as necessary to fulfill the purposes described here or to comply with legal obligations.</p>
          <ul className="list-disc pl-6 mt-3 text-sm text-gray-700">
            <li>Data controller: ITnVend</li>
            <li>Collected data: name, email, phone, company, order history</li>
            <li>Purpose: order processing, quotations, customer support</li>
            <li>Security: encrypted transfers (HTTPS), limited access</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-2xl font-semibold mb-2">Maldives Privacy Policy (Maldives-specific)</h2>
          <p className="text-sm text-gray-700">In addition to the global policy above, we comply with local Maldivian data handling expectations. We ensure that personal data collected from residents of the Maldives is processed lawfully and only for the purposes consented to by the individual.</p>
          <p className="text-sm text-gray-700 mt-2">If you are in the Maldives and have concerns about how your data is used, contact us at the email address in the footer or through the settings contact link.</p>
        </section>
      </div>
    </div>
  );
}
