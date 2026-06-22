import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export default function Layout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-900">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="h-8 w-8 rounded-full border-2 border-brand-400 border-t-transparent"
        />
      </div>
    );
  }

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-[100dvh] w-full max-w-full flex-col overflow-x-hidden bg-surface-900 sm:flex-row">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-x-hidden pb-20 sm:pb-0 sm:pl-64">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mx-auto min-w-0 max-w-6xl p-3 sm:p-6 lg:p-8"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}
