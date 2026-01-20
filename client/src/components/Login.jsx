import { useState } from 'react';
import axios from 'axios';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // 1. Send credentials to backend
      const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
      
      // 2. Save the User Info & Token to "Local Storage" (Browser Memory)
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      
      // 3. Notify App.jsx that we are logged in
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-96 border border-purple-100">
        <h1 className="text-2xl font-bold text-purple-700 mb-6 text-center">Harmono ERP</h1>
        
        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm text-center">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
            <input type="email" required className="w-full border p-2 rounded focus:outline-purple-500"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
            <input type="password" required className="w-full border p-2 rounded focus:outline-purple-500"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="w-full bg-purple-700 text-white font-bold py-2 rounded hover:bg-purple-800 transition">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;