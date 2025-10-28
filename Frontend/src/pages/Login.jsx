import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    try {
      await auth.login(username, password);
      toast.push('Logged in', 'info');
      navigate('/settings');
    } catch (err) {
      toast.push('Login failed', 'error');
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Sign in</h2>
      <form onSubmit={submit} className="bg-white p-6 rounded shadow">
        <label className="block mb-2">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border px-2 py-1 mb-3" />
        <label className="block mb-2">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border px-2 py-1 mb-3" />
        <button className="btn-primary px-4 py-2">Sign in</button>
      </form>
    </div>
  );
}
