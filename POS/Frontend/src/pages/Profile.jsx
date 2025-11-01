import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const INITIAL_FORM = {
  displayName: '',
  email: '',
  phone: '',
  currentPassword: '',
  password: '',
  confirmPassword: '',
};

export default function Profile() {
  const toast = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const data = await api.get('/me');
        setProfile(data);
        setForm((prev) => ({
          ...prev,
          displayName: data.displayName || '',
          email: data.email || '',
          phone: data.phone || '',
        }));
      } catch (err) {
        setError(err?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!profile?.editable) return;
    if (form.password && form.password !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        displayName: form.displayName || null,
        email: form.email || null,
        phone: form.phone || null,
      };
      if (form.password) {
        payload.password = form.password;
        payload.currentPassword = form.currentPassword;
      }
      const updated = await api.put('/me', payload);
      setProfile(updated);
      setForm((prev) => ({
        ...prev,
        currentPassword: '',
        password: '',
        confirmPassword: '',
      }));
      toast.push('Profile updated', 'info');
    } catch (err) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500">
          Update your contact details and change your password.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-sm text-slate-500">Loading profile…</div>
      ) : profile && !profile.editable ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-sm text-yellow-700">
          {profile.message || 'This account type cannot edit profile information.'}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6 max-w-3xl">
          {error && (
            <div className="bg-red-50 border border-red-200 text-sm text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-600">
              Display name
              <input
                name="displayName"
                value={form.displayName}
                onChange={handleChange}
                className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Email
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                type="email"
                className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Phone
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="border-t pt-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Change password</h2>
            <p className="text-xs text-slate-500 mb-4">
              Leave blank to keep your current password.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-600">
                Current password
                <input
                  name="currentPassword"
                  value={form.currentPassword}
                  onChange={handleChange}
                  type="password"
                  className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                New password
                <input
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  type="password"
                  className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Confirm new password
                <input
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  type="password"
                  className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white text-sm hover:bg-blue-700 disabled:bg-blue-400"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
