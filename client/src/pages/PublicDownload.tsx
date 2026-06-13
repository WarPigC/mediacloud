import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cloud, Download, FileText, AlertCircle } from 'lucide-react';
import { formatBytes } from '../lib/api';

interface ShareMeta {
  originalName: string;
  sizeBytes: number;
  mimeType: string;
}

export default function PublicDownload() {
  const { hash } = useParams<{ hash: string }>();
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hash) return;
    fetch(`/api/public/d/${hash}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMeta(data.data);
        else setError(data.error || 'File not found');
      })
      .catch(() => setError('Failed to load file info'))
      .finally(() => setLoading(false));
  }, [hash]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/public/d/${hash}/download`;
    a.download = meta?.originalName || 'download';
    a.click();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-400/50" />
          <h1 className="mt-4 text-xl font-bold text-white">File Not Found</h1>
          <p className="mt-2 text-sm text-surface-200">{error}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm text-center"
      >
        {/* Logo */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/25"
        >
          <Cloud className="h-7 w-7 text-white" />
        </motion.div>

        {/* File info card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10">
            <FileText className="h-8 w-8 text-brand-400" />
          </div>

          <h2 className="truncate text-lg font-semibold text-white">{meta?.originalName}</h2>
          <p className="mt-1 text-sm text-surface-200">{formatBytes(meta?.sizeBytes || 0)}</p>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownload}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-opacity hover:opacity-90"
          >
            <Download className="h-5 w-5" />
            Download File
          </motion.button>
        </div>

        <p className="mt-6 text-xs text-surface-200/50">
          Powered by Media<span className="text-brand-400/50">Cloud</span>
        </p>
      </motion.div>
    </div>
  );
}
