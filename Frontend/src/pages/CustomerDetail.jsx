import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaBuilding, FaDownload, FaEnvelope, FaMapMarkerAlt, FaPhone, FaUser, FaArrowLeft } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const { push: toast } = useToast();
  const { formatCurrency } = useSettings();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    api
      .get(`/customers/${id}`)
      .then((c) => {
        setCustomer(c);
        setForm(c);
      })
      .catch(() => toast('Failed to load customer details', 'error'));

    api
      .get(`/customers/${id}/invoices`)
      .then(setInvoices)
      .catch(() => toast('Failed to load customer invoices', 'error'));
  }, [id, toast]);

  const stats = useMemo(() => {
    if (!customer) return null;
    const lifetimeValue = invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const outstanding = invoices
      .filter((inv) => (inv.status || '') !== 'paid')
      .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const invoiceCount = invoices.length;
    const lastInvoice = invoices
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const lastSeen = lastInvoice ? new Date(lastInvoice.created_at) : null;
    return { lifetimeValue, outstanding, invoiceCount, lastSeen };
  }, [customer, invoices]);

  if (!customer) {
    return (
      <div className="p-6 bg-gray-50 min-h-full">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">Loading customer…</div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const save = async () => {
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        address: form.address || null,
        gst_number: form.gst_number || null,
        registration_number: form.registration_number || null,
        is_business: form.is_business ? 1 : 0,
      };
      const updated = await api.put(`/customers/${id}`, payload);
      setCustomer(updated);
      setForm(updated);
      setEditing(false);
      toast('Customer updated', 'info');
    } catch (err) {
      console.error(err);
      toast('Failed to update customer', 'error');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-full space-y-6">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <Link to="/" className="flex items-center gap-2 hover:text-blue-600">
          <FaArrowLeft /> Dashboard
        </Link>
        <span>›</span>
        <Link to="/admin/customers" className="hover:text-blue-600">
          Customers
        </Link>
        <span>›</span>
        <span className="text-gray-700 font-semibold">{customer.name}</span>
      </div>

      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-semibold">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                  {customer.is_business ? <FaBuilding /> : <FaUser />}
                  {customer.is_business ? 'Business account' : 'Individual'}
                </span>
                {customer.registration_number && (
                  <span className="text-xs text-gray-400 uppercase tracking-wide">
                    Reg #{customer.registration_number}
                  </span>
                )}
              </div>
            </div>
          </div>

          <dl className="grid sm:grid-cols-2 gap-4 text-sm text-gray-600">
            <ContactField icon={<FaEnvelope />} label="Email" value={customer.email} link={`mailto:${customer.email}`} />
            <ContactField icon={<FaPhone />} label="Phone" value={customer.phone || '—'} link={customer.phone ? `tel:${customer.phone}` : undefined} />
            <ContactField
              icon={<FaMapMarkerAlt />}
              label="Address"
              value={customer.address || '—'}
            />
            <ContactField
              icon={<FaBuilding />}
              label="GST / Tax"
              value={customer.gst_number || '—'}
            />
          </dl>
        </div>

        <aside className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Account snapshot</h2>
          <SummaryRow label="Lifetime value" value={formatCurrency(stats?.lifetimeValue || 0)} />
          <SummaryRow
            label="Outstanding"
            value={formatCurrency(stats?.outstanding || 0)}
            valueClass={stats?.outstanding ? 'text-amber-600 font-semibold' : 'text-emerald-600'}
          />
          <SummaryRow label="Invoices" value={stats?.invoiceCount || 0} />
          <SummaryRow
            label="Last activity"
            value={stats?.lastSeen ? new Date(stats.lastSeen).toLocaleDateString() : 'No invoices yet'}
          />
          <div className="pt-2 flex gap-2">
            <button
              onClick={() => setEditing((prev) => !prev)}
              className="flex-1 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {editing ? 'Cancel' : 'Edit profile'}
            </button>
            <a
              href={`mailto:${customer.email}`}
              className="px-3 py-2 text-sm font-semibold border rounded text-slate-600 hover:border-blue-400"
            >
              Email
            </a>
          </div>
        </aside>
      </section>

      {editing && form && (
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Update customer details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput label="Name" name="name" value={form.name} onChange={handleChange} required />
            <FormInput label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
            <FormInput label="Phone" name="phone" value={form.phone || ''} onChange={handleChange} />
            <FormInput label="Address" name="address" value={form.address || ''} onChange={handleChange} />
            <FormInput label="GST / Tax number" name="gst_number" value={form.gst_number || ''} onChange={handleChange} />
            <FormInput label="Registration number" name="registration_number" value={form.registration_number || ''} onChange={handleChange} />
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm text-gray-600">
            <input type="checkbox" name="is_business" checked={!!form.is_business} onChange={handleChange} className="h-4 w-4 text-blue-600" />
            Treat as business account
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm font-semibold border rounded text-gray-600 hover:border-gray-400">
              Cancel
            </button>
            <button onClick={save} className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700">
              Save changes
            </button>
          </div>
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Billing history</h2>
            <p className="text-xs text-gray-500">Invoices and quotes associated with this customer</p>
          </div>
          <Link to="/admin/invoices" className="text-sm text-blue-600 hover:underline">
            View invoices
          </Link>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Document</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-800">#{invoice.id}</div>
                      <div className="text-xs text-gray-400 uppercase tracking-wide">{invoice.type === 'quote' ? 'Quote' : 'Invoice'}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${badgeClass(invoice.status, invoice.type)}`}>
                        {badgeLabel(invoice.status, invoice.type)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatCurrency(invoice.total)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={async () => {
                          try {
                            const resp = await api.post(`/invoices/${invoice.id}/pdf-link`);
                            if (resp && resp.url) {
                              window.open(resp.url, '_blank');
                            } else {
                              toast('Failed to create PDF link', 'error');
                            }
                          } catch (err) {
                            console.error(err);
                            toast('Failed to open PDF', 'error');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        <FaDownload /> PDF
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No invoices recorded for this customer yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ContactField({ icon, label, value, link }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 text-blue-500">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
        {link ? (
          <a href={link} className="text-sm text-blue-600 hover:underline">
            {value}
          </a>
        ) : (
          <div className="text-sm text-gray-700">{value}</div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, valueClass }) {
  return (
    <div className="flex justify-between text-sm text-gray-600">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass || 'font-semibold text-gray-900'}>{value}</span>
    </div>
  );
}

function FormInput({ label, name, value, onChange, type = 'text', required = false }) {
  return (
    <label className="block text-sm text-gray-600 font-medium">
      {label} {required && <span className="text-red-500">*</span>}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        required={required}
      />
    </label>
  );
}

function badgeClass(status, type) {
  const map = {
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
    issued: 'bg-blue-100 text-blue-700',
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-indigo-100 text-indigo-700',
    accepted: 'bg-green-100 text-green-700',
  };
  if (!status) return type === 'quote' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700';
  return map[status] || 'bg-gray-100 text-gray-600';
}

function badgeLabel(status, type) {
  if (!status) return type === 'quote' ? 'Draft' : 'Issued';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
