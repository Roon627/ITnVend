import React from 'react';

// A small, reusable component to render denomination rows and a print helper.
// Props:
// - denominations: [{ value, key }]
// - cashCounts: object mapping key -> number
// - onChange: function(key, value)
// - formatCurrency: (amount) => string
export default function DenominationRows({ denominations = [], cashCounts = {}, onChange = () => {}, formatCurrency = (n) => n }) {
  return (
    <div className="space-y-3">
      {denominations.map((d) => (
        <div className="grid grid-cols-2 gap-4" key={d.key}>
          <div>
            <label className="block text-sm font-medium text-gray-700">{formatCurrency(d.value)}</label>
            <input
              type="number"
              min="0"
              value={cashCounts[d.key] ?? 0}
              onChange={(e) => onChange(d.key, e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="text-right pt-6">
            <span className="text-sm text-gray-600">
              {formatCurrency((Number(cashCounts[d.key] || 0) * d.value) || 0)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper to render printable denomination rows (returns HTML string)
export function renderDenominationRowsForPrint(denominations = [], cashCounts = {}, formatCurrency = (n) => n) {
  return denominations
    .map((d) => {
      const count = Number(cashCounts[d.key] || 0);
      return `<tr><td>${formatCurrency(d.value)}</td><td>${count}</td><td>${formatCurrency(count * d.value)}</td></tr>`;
    })
    .join('');
}
