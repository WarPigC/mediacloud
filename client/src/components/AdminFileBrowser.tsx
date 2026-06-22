import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Folder, ChevronRight, Home, RefreshCw, ArrowLeft,
  Download, Share2, MoreVertical, Trash2, Link2Off,
  FileText, Image, Video, Music, Archive, File,
} from 'lucide-react';
import { api, downloadFile, formatBytes } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ShareModal from './ShareModal';
import { SkeletonGrid } from './SkeletonCard';

interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  mimeType?: string;
  fileId?: string;
  isPublic?: boolean;
  shareHash?: string | null;
}

// ─── Icon + Color helpers ───

const mimeIcons: Record<string, any> = {
  'image/': Image, 'video/': Video, 'audio/': Music,
  'application/zip': Archive, 'application/x-7z': Archive,
  'application/x-rar': Archive, 'application/gzip': Archive,
  'application/vnd.rar': Archive,
};

function getIcon(mime: string) {
  for (const [prefix, icon] of Object.entries(mimeIcons)) {
    if (mime.startsWith(prefix)) return icon;
  }
  return mime.includes('text') || mime.includes('pdf') ? FileText : File;
}

const mimeColors: Record<string, string> = {
  'image/': 'from-pink-500/20 to-rose-500/20 text-pink-400',
  'video/': 'from-purple-500/20 to-violet-500/20 text-purple-400',
  'audio/': 'from-amber-500/20 to-orange-500/20 text-amber-400',
  'application/zip': 'from-emerald-500/20 to-teal-500/20 text-emerald-400',
  'application/vnd.rar': 'from-emerald-500/20 to-teal-500/20 text-emerald-400',
};

function getColor(mime: string) {
  for (const [prefix, color] of Object.entries(mimeColors)) {
    if (mime.startsWith(prefix)) return color;
  }
  return 'from-brand-500/20 to-indigo-500/20 text-brand-400';
}

// ─── Main Component ───

export default function AdminFileBrowser() {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchEntries = useCallback(async (browsePath: string) => {
    setLoading(true);
    try {
      const encodedPath = encodeURIComponent(browsePath);
      const res = await api.get<{ data: { entries: BrowseEntry[]; currentPath: string } }>(
        `/files/browse?path=${encodedPath}`
      );
      setEntries(res.data.entries);
      setCurrentPath(res.data.currentPath);
    } catch (err: any) {
      addToast(err.message, 'error');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchEntries(''); }, [fetchEntries]);

  const navigateTo = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    fetchEntries(newPath);
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchEntries(parts.join('/'));
  };

  const navigateToSegment = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    fetchEntries(parts.slice(0, index + 1).join('/'));
  };

  const pathSegments = currentPath.split('/').filter(Boolean);
  const dirCount = entries.filter((e) => e.type === 'directory').length;
  const fileCount = entries.filter((e) => e.type === 'file').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">My Files</h1>
        <button
          onClick={() => fetchEntries(currentPath)}
          className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-surface-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="mb-5 flex items-center gap-1 overflow-x-auto rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm scrollbar-none">
        <button
          onClick={() => fetchEntries('')}
          className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-white/10 ${
            pathSegments.length === 0 ? 'text-brand-400' : 'text-surface-200 hover:text-white'
          }`}
        >
          <Home className="h-3.5 w-3.5" />
          <span>Root</span>
        </button>
        {pathSegments.map((seg, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-surface-200/40" />
            <button
              onClick={() => navigateToSegment(i)}
              className={`rounded-lg px-2 py-1 transition-colors hover:bg-white/10 ${
                i === pathSegments.length - 1 ? 'text-brand-400 font-medium' : 'text-surface-200 hover:text-white'
              }`}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Back button + summary */}
      <div className="mb-4 flex items-center justify-between">
        {pathSegments.length > 0 ? (
          <button
            onClick={navigateUp}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-surface-200 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}
        {!loading && (
          <p className="text-xs text-surface-200">
            {dirCount > 0 && `${dirCount} folder${dirCount !== 1 ? 's' : ''}`}
            {dirCount > 0 && fileCount > 0 && ' · '}
            {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? 's' : ''}`}
            {dirCount === 0 && fileCount === 0 && 'Empty directory'}
          </p>
        )}
      </div>

      {/* Content Grid */}
      {loading ? (
        <SkeletonGrid />
      ) : entries.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <FolderOpen className="mb-4 h-16 w-16 text-white/10" />
          <p className="text-lg font-medium text-surface-200">Empty directory</p>
          <p className="mt-1 text-sm text-surface-200/60">This folder has no files or subfolders</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry, i) =>
              entry.type === 'directory' ? (
                <FolderCard
                  key={`dir-${entry.name}`}
                  name={entry.name}
                  index={i}
                  onClick={() => navigateTo(entry.name)}
                />
              ) : (
                <BrowseFileCard
                  key={`file-${entry.name}`}
                  entry={entry}
                  index={i}
                  onAction={() => fetchEntries(currentPath)}
                />
              )
            )}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── Folder Card ───

function FolderCard({ name, index, onClick }: { name: string; index: number; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition-colors hover:border-brand-500/30 hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
          <Folder className="h-5 w-5 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{name}</p>
          <p className="text-xs text-surface-200">Folder</p>
        </div>
        <ChevronRight className="h-4 w-4 text-surface-200/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
      </div>
    </motion.div>
  );
}

// ─── File Card (Browse Mode) ───

function BrowseFileCard({ entry, index, onAction }: { entry: BrowseEntry; index: number; onAction: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareHash, setShareHash] = useState(entry.shareHash || null);
  const { addToast } = useToast();

  const Icon = getIcon(entry.mimeType || '');
  const colorClass = getColor(entry.mimeType || '');

  const handleDownload = () => {
    if (!entry.fileId) return;
    downloadFile(`/files/${entry.fileId}/download`, entry.name);
    setMenuOpen(false);
  };

  const handleShare = async () => {
    if (!entry.fileId) return;
    try {
      const res = await api.post<{ data: { shareHash: string } }>(`/files/${entry.fileId}/share`);
      setShareHash(res.data.shareHash);
      setShareOpen(true);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
    setMenuOpen(false);
  };

  const handleUnshare = async () => {
    if (!entry.fileId) return;
    try {
      await api.del(`/files/${entry.fileId}/share`);
      setShareHash(null);
      addToast('Share link removed', 'info');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!entry.fileId) return;
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      await api.del(`/files/${entry.fileId}`);
      addToast('File deleted', 'success');
      onAction();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
    setMenuOpen(false);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03, duration: 0.25 }}
        whileHover={{ scale: 1.01 }}
        className="group relative rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.06]"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{entry.name}</p>
            <p className="text-xs text-surface-200">
              {entry.sizeBytes !== undefined ? formatBytes(entry.sizeBytes) : ''}
            </p>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-1.5 text-surface-200 opacity-0 transition-all hover:bg-white/10 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-white/10 bg-surface-800 p-1 shadow-2xl"
                >
                  <MenuItem icon={Download} label="Download" onClick={handleDownload} />
                  <MenuItem icon={Share2} label="Share" onClick={handleShare} />
                  {shareHash && (
                    <MenuItem icon={Link2Off} label="Remove link" onClick={handleUnshare} />
                  )}
                  <div className="my-1 border-t border-white/5" />
                  <MenuItem icon={Trash2} label="Delete" onClick={handleDelete} danger />
                </motion.div>
              </>
            )}
          </div>
        </div>

        {shareHash && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400/70">
            <Share2 className="h-3 w-3" />
            <span>Shared</span>
          </div>
        )}
      </motion.div>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        shareHash={shareHash}
        fileName={entry.name}
      />
    </>
  );
}

// ─── Shared MenuItem ───

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: any; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-surface-200 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
