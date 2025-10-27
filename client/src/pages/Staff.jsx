import React, { useEffect, useState } from 'react';
import { api, setAuthToken } from '../lib/api';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', email: '', phone: '', roles: [] });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityEntries, setActivityEntries] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const toast = useToast();
  const [roleErrors, setRoleErrors] = useState({});

  async function load() {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([api.get('/staff'), api.get('/roles')]);
      setStaff(s || []);
      setRoles(r || []);
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ username: '', password: '', display_name: '', email: '', phone: '', roles: [] });
    setFormOpen(true);
  }

  function openEdit(s) {
    setEditingId(s.id);
    setForm({ username: s.username, password: '', display_name: s.display_name || '', email: s.email || '', phone: s.phone || '', roles: (s.roles || []).map(r => r.id) });
    setFormOpen(true);
  }

  function toggleRole(id) {
    setForm(f => {
      const has = f.roles.includes(id);
      return { ...f, roles: has ? f.roles.filter(x => x !== id) : [...f.roles, id] };
    });
  }

  // Inline role toggle for a staff row
  async function toggleInlineRole(staffId, roleId) {
    setError(null);
    try {
      // find staff row
      const s = staff.find(x => x.id === staffId);
      if (!s) return;
      const currentRoleIds = (s.roles || []).map(r => r.id);
      const has = currentRoleIds.includes(roleId);
      const newRoles = has ? currentRoleIds.filter(r => r !== roleId) : [...currentRoleIds, roleId];
      // call server to set roles
      await api.post(`/staff/${staffId}/roles`, { roles: newRoles });
      // optimistic update locally
      const updatedStaff = staff.map(x => x.id === staffId ? { ...x, roles: roles.filter(r => newRoles.includes(r.id)) } : x);
      setStaff(updatedStaff);
      // reload staff list from server to ensure consistency
      await load();
      // reload activity for this staff if open
      if (activityOpen) await loadActivity(staffId);
    } catch (err) {
      console.error(err);
      const msg = err?.message || String(err);
      setError(msg);
      toast?.push('Failed to update roles: ' + msg, 'error');
      // show inline banner for this staff row
      setRoleErrors(prev => ({ ...prev, [staffId]: msg }));
      setTimeout(() => setRoleErrors(prev => { const c = { ...prev }; delete c[staffId]; return c; }), 6000);
    }
  }

  async function submit() {
    setError(null);
    try {
      if (editingId) {
        const payload = { display_name: form.display_name, email: form.email, phone: form.phone, roles: form.roles };
        if (form.password) payload.password = form.password;
        await api.put(`/staff/${editingId}`, payload);
      } else {
        if (!form.username || !form.password) return setError('Username and password required');
        await api.post('/staff', { username: form.username, password: form.password, display_name: form.display_name, email: form.email, phone: form.phone, roles: form.roles });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }

  async function remove(id) {
    if (!confirm('Delete staff?')) return;
    try {
      await api.del(`/staff/${id}`);
      await load();
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }

  async function switchTo(s) {
    if (!confirm(`Switch to user ${s.username}? You will become this user until you switch back.`)) return;
    try {
      const res = await api.post(`/staff/${s.id}/switch`);
      // set token for client and update auth context
      setAuthToken(res.token);
      // also update AuthContext if available
      if (typeof window !== 'undefined' && window.__ITNVEND_SWITCH_USER__) {
        window.__ITNVEND_SWITCH_USER__(res.token, res.role, s.username);
      }
      // fallback localStorage updates
      localStorage.setItem('ITnvend_role', res.role);
  localStorage.setItem('ITnvend_token', res.token);
  localStorage.setItem('ITnvend_username', s.username);
      // quick reload to reflect new permissions
      location.reload();
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }

  async function loadActivity(staffId) {
    setActivityLoading(true);
    try {
      const logs = await api.get(`/staff/${staffId}/activity`);
      setActivityEntries(logs || []);
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    } finally {
      setActivityLoading(false);
    }
  }

  function openActivity(s) {
    setActivityEntries([]);
    setActivityOpen(true);
    loadActivity(s.id);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Staff</h2>
        <div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={openCreate}>New Staff</button>
        </div>
      </div>

      {error && <div className="mb-4 text-red-600">{error}</div>}

      <div className="bg-white shadow rounded overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="p-4">Loading…</td></tr>}
            {!loading && staff.length === 0 && <tr><td colSpan="6" className="p-4">No staff yet</td></tr>}
            {!loading && staff.map(s => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-3">{s.username}</td>
                <td className="px-4 py-3">{s.display_name}</td>
                <td className="px-4 py-3">{s.email}</td>
                <td className="px-4 py-3">{s.phone}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 items-center">
                    {(roles || []).map(r => (
                      <label key={r.id} className="inline-flex items-center text-sm mr-2">
                        <input type="checkbox" className="mr-1" checked={(s.roles || []).some(x => x.id === r.id)} onChange={() => toggleInlineRole(s.id, r.id)} />
                        <span className="px-2 py-1 rounded bg-gray-100">{r.name}</span>
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button className="mr-2 text-sm px-3 py-1 bg-yellow-100 rounded" onClick={() => openEdit(s)}>Edit</button>
                  <button className="mr-2 text-sm px-3 py-1 bg-blue-100 rounded" onClick={() => openActivity(s)}>Activity</button>
                  <button className="mr-2 text-sm px-3 py-1 bg-green-100 rounded" onClick={() => switchTo(s)}>Switch</button>
                  <button className="text-sm px-3 py-1 bg-red-100 rounded" onClick={() => remove(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!loading && Object.keys(roleErrors).length > 0 && staff.map(s => (
              roleErrors[s.id] ? (
                <tr key={`err-${s.id}`}>
                  <td colSpan="6" className="px-4 py-2 bg-yellow-50 text-sm text-yellow-800">Role update failed: {roleErrors[s.id]}</td>
                </tr>
              ) : null
            ))}
          </tbody>
        </table>
      </div>

      {activityOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center p-6">
          <div className="bg-white rounded shadow max-w-2xl w-full p-6">
            <h3 className="text-lg font-medium mb-4">Activity</h3>
            {activityLoading && <div>Loading…</div>}
            {!activityLoading && activityEntries.length === 0 && <div className="text-sm text-gray-600">No activity found</div>}
            <ul className="space-y-2 max-h-80 overflow-auto">
              {activityEntries.map(a => (
                <li key={a.id} className="p-2 border rounded">
                  <div className="text-sm text-gray-700"><strong>{a.action}</strong> — {a.details}</div>
                  <div className="text-xs text-gray-500">By: {a.user || 'system'} • {a.created_at}</div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button className="px-4 py-2 border rounded" onClick={() => setActivityOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center p-6">
          <div className="bg-white rounded shadow max-w-xl w-full p-6">
            <h3 className="text-lg font-medium mb-4">{editingId ? 'Edit Staff' : 'Create Staff'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm">Username</label>
                <input className="mt-1 p-2 border w-full" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} disabled={!!editingId} />
              </div>
              <div>
                <label className="block text-sm">Display name</label>
                <input className="mt-1 p-2 border w-full" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Email</label>
                <input className="mt-1 p-2 border w-full" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Phone</label>
                <input className="mt-1 p-2 border w-full" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Password{editingId ? ' (leave blank to keep)' : ''}</label>
                <input type="password" className="mt-1 p-2 border w-full" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Roles</label>
                <div className="mt-1 space-y-1">
                  {roles.map(r => (
                    <label key={r.id} className="inline-flex items-center mr-3">
                      <input type="checkbox" className="mr-2" checked={form.roles.includes(r.id)} onChange={() => toggleRole(r.id)} />
                      <span>{r.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="px-4 py-2 border rounded" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={submit}>{editingId ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
