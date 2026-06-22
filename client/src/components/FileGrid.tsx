import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { api, formatBytes } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import FileCard from './FileCard';
import { SkeletonGrid } from './SkeletonCard';

interface FileData {
  id: string;
  originalName: string;
  sanitizedName: string;
  mimeType: string;
  sizeBytes: number;
  shareHash: string | null;
  isPublic: boolean;
  createdAt: string;
}

export default function FileGrid() {
  const { user, refreshUser } = useAuth();
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: FileData[] }>('/files');
      setFiles(res.data);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleDelete = () => {
    fetchFiles();
    refreshUser();
  };

  const usedPct = user ? Math.round((user.usedStorageBytes / user.storageQuotaBytes) * 100) : 0;

  return (
    <div className="w-full min-w-0">
      {/* Header with quota */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">My Files</h1>
          {user && user.role !== 'admin' && (
            <p className="mt-1 text-xs text-surface-200 sm:text-sm">
              {formatBytes(user.usedStorageBytes)} of {formatBytes(user.storageQuotaBytes)} used
            </p>
          )}
        </div>
        <button
          onClick={fetchFiles}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-surface-200 transition-colors hover:bg-white/10 hover:text-white sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
        >
          <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Refresh
        </button>
      </div>

      {/* Quota bar */}
      {user && user.role !== 'admin' && (
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(usedPct, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-amber-500' : 'bg-brand-500'
            }`}
          />
        </div>
      )}

      {/* File list */}
      {loading ? (
        <SkeletonGrid />
      ) : files.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <FolderOpen className="mb-4 h-16 w-16 text-white/10" />
          <p className="text-lg font-medium text-surface-200">No files yet</p>
          <p className="mt-1 text-sm text-surface-200/60">Upload your first file to get started</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
            {files.map((f, i) => (
              <FileCard key={f.id} file={f} onDelete={handleDelete} index={i} />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
