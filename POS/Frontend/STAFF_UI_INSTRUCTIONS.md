How to add Lock/Unlock UI to Staff management page

Files added:
- `src/components/StaffLockControl.jsx` — Lock/Unlock button that calls the backend endpoints and shows toasts.
- `src/components/AccountLockedBanner.jsx` — simple banner to show on the login page when an account is locked.

Integrate into your Staff list row (example JSX):

```jsx
import StaffLockControl from '../components/StaffLockControl';

// inside your staff row render
<tr key={s.id}>
  <td>{s.username}</td>
  <td>{s.displayName}</td>
  <td>{s.email}</td>
  <td>{s.phone}</td>
  <td className="text-right">
    <div className="inline-flex gap-2 items-center">
      <button onClick={() => openEdit(s)} className="btn">Edit</button>
      <button onClick={() => viewActivity(s)} className="btn">Activity</button>
      <StaffLockControl staffId={s.id} initialLocked={s.locked} onChange={(u) => refreshStaffList()} />
    </div>
  </td>
</tr>
```

Integrate into Login page

- When your login POST returns an error with status 403 and message 'Account locked...', show the `AccountLockedBanner` instead of the normal error.

Example (pseudo-code):

```jsx
import { api } from '../lib/api';
import AccountLockedBanner from '../components/AccountLockedBanner';

async function submitLogin() {
  try {
    const res = await api.post('/login', { username, password });
    // success: continue
  } catch (err) {
    if (err?.status === 403 && err?.data?.error) {
      setLockedMessage(err.data.error);
      return;
    }
    setError(err.message || 'Login failed');
  }
}

// in render
{lockedMessage ? <AccountLockedBanner message={lockedMessage} /> : null}
```

Notes
- The backend endpoints are:
  - `POST /api/staff/:id/lock` — locks account, clears refresh tokens, notifies the user.
  - `POST /api/staff/:id/unlock` — unlocks account and notifies the user.
- The backend will also auto-lock an account when all roles are removed (POST `/api/staff/:id/roles` or PUT `/api/staff/:id`).

