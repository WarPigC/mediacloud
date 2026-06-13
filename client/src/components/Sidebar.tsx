import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cloud, FolderOpen, Upload, Shield, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: FolderOpen, label: 'Files' },
  { to: '/upload', icon: Upload, label: 'Upload' },
];

const adminItems = [
  { to: '/admin', icon: Shield, label: 'Admin' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/5 bg-surface-800/50 backdrop-blur-xl sm:flex">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
          <Cloud className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white">
          Media<span className="text-brand-400">Cloud</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
        {user?.role === 'admin' && adminItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20">
            <User className="h-4 w-4 text-brand-400" />
          </div>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium text-white">{user?.username}</p>
            <p className="text-xs text-surface-200">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-surface-200 transition-colors hover:bg-white/10 hover:text-red-400"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          isActive
            ? 'bg-brand-500/15 text-brand-300'
            : 'text-surface-200 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-5 w-5 ${isActive ? 'text-brand-400' : ''}`} />
          {label}
          {isActive && (
            <motion.div
              layoutId="sidebar-indicator"
              className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400"
            />
          )}
        </>
      )}
    </NavLink>
  );
}
