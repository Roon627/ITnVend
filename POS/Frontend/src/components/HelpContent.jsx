import React from 'react';

export default function HelpContent() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="bg-white rounded-lg shadow-sm p-5 space-y-2">
        <h3 className="text-lg font-semibold text-slate-800">Start of shift checklist</h3>
        <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
          <li>Open the cash drawer and confirm starting float.</li>
          <li>Ensure receipt printers and card terminals are online.</li>
          <li>Check stock alerts for items that need restocking.</li>
          <li>Run a quick test transaction and PDF to confirm configuration.</li>
        </ul>

        <h3 className="text-lg font-semibold text-slate-800 mt-4">Creating invoices & quotes</h3>
        <ol className="text-sm text-slate-600 list-decimal list-inside mt-2 space-y-1">
          <li>Click "New Invoice" or "New Quote" on the Invoices page.</li>
          <li>Search products and click to add them to the cart shown on the right.</li>
          <li>Select the customer from the dropdown. If no customer exists, add one in Customers.</li>
          <li>Adjust quantities or remove items in the cart, verify tax and totals, then click Create.</li>
          <li>Use the PDF action to view, print, or download the document. Change status to Paid/Sent/Cancelled as needed.</li>
        </ol>

        <h3 className="text-lg font-semibold text-slate-800 mt-4">Ending shift & reconciliation</h3>
        <p className="text-sm text-slate-600">At shift end, confirm all payments, print or export end-of-day reports, reconcile the cash drawer, and clear float if needed. Use exported CSVs or PDFs for bookkeeping.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5 space-y-2">
        <h3 className="text-lg font-semibold text-slate-800">Help articles & contact</h3>
        <p className="text-sm text-slate-600">Search the help articles for quick answers or contact support for personalised help.</p>
        <div className="mt-3 text-sm text-slate-600">
          <strong>Support:</strong> support@itnvend.test — <span className="block">+960 300 0000</span>
        </div>
      </div>
    </div>
  );
}
