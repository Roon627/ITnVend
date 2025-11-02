import { useMemo, useState } from 'react';
import HelpContent from '../components/HelpContent';

const ARTICLES = [
  {
    id: 1,
    title: 'Creating invoices from the POS',
    body: 'From the POS screen add items to the cart, select a customer, then choose checkout → invoice. A PDF will be generated automatically and saved under Invoices.',
    tags: ['invoice', 'pos', 'checkout'],
  },
  {
    id: 2,
    title: 'Using bulk import for products',
    body: 'Navigate to Products and open the bulk import panel. Upload a CSV with Name, Price, Stock, and SKU columns. Preview the rows before committing the import.',
    tags: ['products', 'import'],
  },
  {
    id: 3,
    title: 'Updating outlet settings',
    body: 'Administrators and managers can update outlet details, tax rates, and email templates from Settings. Changes apply immediately to new invoices.',
    tags: ['settings', 'outlet'],
  },
];

export default function Help() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return ARTICLES;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return ARTICLES.filter((article) =>
      terms.every((term) =>
        article.title.toLowerCase().includes(term) ||
        article.body.toLowerCase().includes(term) ||
        article.tags.some((tag) => tag.toLowerCase().includes(term))
      )
    );
  }, [query]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Help &amp; Resources</h1>
        <p className="text-sm text-slate-500">
          Search quick answers, explore onboarding guides, or reach out to our support team.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <label className="flex-1 text-sm font-medium text-slate-600">
            Search help articles
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Keywords, e.g. invoice or import"
              className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-700 max-w-sm">
            Need personalised help? Email <span className="font-semibold">support@itnvend.test</span> or call
            <span className="font-semibold"> +960 300 0000</span>.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500">No articles match your search.</div>
          ) : (
            filtered.map((article) => (
              <article key={article.id} className="border rounded-lg p-4 space-y-2">
                <h2 className="text-base font-semibold text-slate-800">{article.title}</h2>
                <p className="text-sm text-slate-600">{article.body}</p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {article.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 rounded-full bg-slate-100">{tag}</span>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <HelpContent />
    </div>
  );
}
