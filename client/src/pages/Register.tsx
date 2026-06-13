import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cloud, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(username, email, password);
      addToast('Account created! Please sign in.', 'success');
      navigate('/login');
    } catch (err: any) {
      addToast(err.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/25">
            <Cloud className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="mt-1 text-sm text-surface-200">Join MediaCloud</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur-xl">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-200">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              minLength={3}
              pattern="[a-zA-Z0-9_]+"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              placeholder="Choose a username"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-200">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-200">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                placeholder="Min. 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200 hover:text-white"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Create Account
              </>
            )}
          </motion.button>
        </form>

        <p className="mt-4 text-center text-sm text-surface-200">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
