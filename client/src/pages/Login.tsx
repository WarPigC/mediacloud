import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cloud, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      addToast(err.message || 'Login failed', 'error');
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
        {/* Logo */}
        <div className="mb-8 text-center">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/25"
          >
            <Cloud className="h-7 w-7 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white">
            Welcome to Media<span className="text-brand-400">Cloud</span>
          </h1>
          <p className="mt-1 text-sm text-surface-200">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur-xl">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-200">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              placeholder="Enter username"
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
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                placeholder="Enter password"
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
                <LogIn className="h-4 w-4" />
                Sign In
              </>
            )}
          </motion.button>
        </form>

        <p className="mt-4 text-center text-sm text-surface-200">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-brand-400 hover:text-brand-300">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
