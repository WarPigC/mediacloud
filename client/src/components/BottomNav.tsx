import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen, Upload, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const items = [
  { to: '/dashboard', icon: FolderOpen, label: 'Files' },
  { to: '/upload', icon: Upload, label: 'Upload' },
];

export default function BottomNav() {
  const { user, logout } = useAuth();
  const allItems = user?.role === 'admin'
    ? [...items, { to: '/admin', icon: Shield, label: 'Admin' }]
    : items;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-surface-800/80 backdrop-blur-xl sm:hidden">
      <div className="flex items-center justify-around py-2">
        {allItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-4 py-1 text-xs font-medium transition-colors ${
                isActive ? 'text-brand-400' : 'text-surface-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="bottom-nav-pill"
                    className="absolute -top-2 h-0.5 w-8 rounded-full bg-brand-400"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Logout button */}
        <button
          onClick={logout}
          className="relative flex flex-col items-center gap-0.5 px-4 py-1 text-xs font-medium text-surface-200 transition-colors hover:text-red-400"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
