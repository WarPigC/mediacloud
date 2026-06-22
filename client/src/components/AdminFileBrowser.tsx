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
    <div className="w-full min-w-0">
      {/* Header — always single row */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white sm:text-2xl">My Files</h1>
        <button
          onClick={() => fetchEntries(currentPath)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-surface-200 transition-colors hover:bg-white/10 hover:text-white sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
        >
          <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Refresh
        </button>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="mb-3 flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-white/[0.03] px-2 py-2 text-xs sm:gap-1 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm">
        <button
          onClick={() => fetchEntries('')}
          className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/10 sm:rounded-lg sm:px-2 sm:py-1 ${
            pathSegments.length === 0 ? 'text-brand-400' : 'text-surface-200 hover:text-white'
          }`}
        >
          <Home className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>Root</span>
        </button>
        {pathSegments.map((seg, i) => (
          <span key={i} className="flex shrink-0 items-center gap-0.5">
            <ChevronRight className="h-3 w-3 text-surface-200/40" />
            <button
              onClick={() => navigateToSegment(i)}
              className={`max-w-[120px] truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/10 sm:max-w-none sm:rounded-lg sm:px-2 sm:py-1 ${
                i === pathSegments.length - 1 ? 'text-brand-400 font-medium' : 'text-surface-200 hover:text-white'
              }`}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Back button + summary */}
      <div className="mb-3 flex items-center justify-between">
        {pathSegments.length > 0 ? (
          <button
            onClick={navigateUp}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-surface-200 transition-colors hover:bg-white/5 hover:text-white sm:gap-1.5 sm:rounded-lg sm:px-2 sm:text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Back
          </button>
        ) : (
          <div />
        )}
        {!loading && (
          <p className="shrink-0 text-[10px] text-surface-200 sm:text-xs">
            {dirCount > 0 && `${dirCount} folder${dirCount !== 1 ? 's' : ''}`}
            {dirCount > 0 && fileCount > 0 && ' · '}
            {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? 's' : ''}`}
            {dirCount === 0 && fileCount === 0 && 'Empty'}
          </p>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonGrid />
      ) : entries.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center sm:py-20"
        >
          <FolderOpen className="mb-3 h-12 w-12 text-white/10 sm:mb-4 sm:h-16 sm:w-16" />
          <p className="text-base font-medium text-surface-200 sm:text-lg">Empty directory</p>
          <p className="mt-1 text-xs text-surface-200/60 sm:text-sm">No files or subfolders here</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors active:bg-white/[0.08] sm:rounded-2xl sm:p-4 sm:hover:border-brand-500/30 sm:hover:bg-white/[0.06]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 sm:h-11 sm:w-11 sm:rounded-xl">
        <Folder className="h-4 w-4 text-blue-400 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="text-[10px] text-surface-200 sm:text-xs">Folder</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-surface-200/40 sm:transition-transform sm:group-hover:translate-x-0.5 sm:group-hover:text-white" />
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02, duration: 0.2 }}
        className="group relative flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors sm:rounded-2xl sm:p-4 sm:hover:border-white/10 sm:hover:bg-white/[0.06]"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br sm:h-11 sm:w-11 sm:rounded-xl ${colorClass}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{entry.name}</p>
          <p className="text-[10px] text-surface-200 sm:text-xs">
            {entry.sizeBytes !== undefined ? formatBytes(entry.sizeBytes) : ''}
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-lg p-1.5 text-surface-200 transition-all hover:bg-white/10 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-white/10 bg-surface-800 p-1 shadow-2xl sm:w-44"
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

        {shareHash && (
          <div className="absolute bottom-1.5 left-14 flex items-center gap-1 text-[10px] text-emerald-400/70 sm:bottom-2 sm:left-16 sm:text-xs">
            <Share2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
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
