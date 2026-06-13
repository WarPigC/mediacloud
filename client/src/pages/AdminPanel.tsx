import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, HardDrive, FileText, Trash2, UserPlus } from 'lucide-react';
import { api, formatBytes } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface AdminUser {
  id: string; username: string; email: string; role: string;
  usedStorageBytes: number; storageQuotaBytes: number;
  _count: { files: number };
}
interface Stats { userCount: number; fileCount: number; totalStorageUsed: number; disk: { free: number; total: number } }

export default function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { addToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([
        api.get<{ data: AdminUser[] }>('/admin/users'),
        api.get<{ data: Stats }>('/admin/stats'),
      ]);
      setUsers(u.data); setStats(s.data);
    } catch (err: any) { addToast(err.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all files?`)) return;
    try { await api.del(`/admin/users/${id}`); addToast(`Deleted "${name}"`, 'success'); fetchData(); }
    catch (err: any) { addToast(err.message, 'error'); }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Admin Panel</h1>
      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Users, label: 'Users', value: stats.userCount },
            { icon: FileText, label: 'Files', value: stats.fileCount },
            { icon: HardDrive, label: 'Disk Free', value: formatBytes(stats.disk.free) },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
              <s.icon className="mb-2 h-5 w-5 text-brand-400" />
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-surface-200">{s.label}</p>
            </motion.div>
          ))}
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Users</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          <UserPlus className="h-4 w-4" /> New User
        </button>
      </div>
      {showCreate && <CreateForm onDone={() => { setShowCreate(false); fetchData(); }} />}
      {loading ? <p className="text-surface-200">Loading...</p> : (
        <div className="space-y-2">
          {users.map((u, i) => (
            <motion.div key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${u.role === 'admin' ? 'bg-amber-500/15 text-amber-400' : 'bg-brand-500/15 text-brand-400'}`}>
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white">{u.username}</p>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-surface-200'}`}>{u.role}</span>
                </div>
                <p className="text-xs text-surface-200">{u._count.files} files · {formatBytes(u.usedStorageBytes)} used</p>
              </div>
              {u.role !== 'admin' && (
                <button onClick={() => deleteUser(u.id, u.username)} className="rounded-lg p-2 text-surface-200 hover:bg-red-500/10 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [u, setU] = useState(''); const [e, setE] = useState(''); const [p, setP] = useState('');
  const [l, setL] = useState(false); const { addToast } = useToast();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setL(true);
    try { await api.post('/admin/users', { username: u, email: e, password: p }); addToast('User created', 'success'); onDone(); }
    catch (err: any) { addToast(err.message, 'error'); } finally { setL(false); }
  };
  return (
    <form onSubmit={submit} className="mb-6 grid gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:grid-cols-4">
      <input value={u} onChange={(x) => setU(x.target.value)} placeholder="Username" required className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-500" />
      <input value={e} onChange={(x) => setE(x.target.value)} placeholder="Email" required type="email" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-500" />
      <input value={p} onChange={(x) => setP(x.target.value)} placeholder="Password" required type="password" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-500" />
      <button type="submit" disabled={l} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{l ? 'Creating...' : 'Create'}</button>
    </form>
  );
}
