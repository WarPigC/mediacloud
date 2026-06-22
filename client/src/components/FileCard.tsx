import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Image, Video, Music, Archive, File, Download, Share2, Trash2, MoreVertical, Link2Off
} from 'lucide-react';
import { api, downloadFile, formatBytes } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ShareModal from './ShareModal';

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

interface FileCardProps {
  file: FileData;
  onDelete: () => void;
  index: number;
}

const mimeIcons: Record<string, any> = {
  'image/': Image,
  'video/': Video,
  'audio/': Music,
  'application/zip': Archive,
  'application/x-7z': Archive,
  'application/x-rar': Archive,
  'application/gzip': Archive,
};

function getIcon(mime: string) {
  for (const [prefix, icon] of Object.entries(mimeIcons)) {
    if (mime.startsWith(prefix)) return icon;
  }
  return mime.includes('text') ? FileText : File;
}

const mimeColors: Record<string, string> = {
  'image/': 'from-pink-500/20 to-rose-500/20 text-pink-400',
  'video/': 'from-purple-500/20 to-violet-500/20 text-purple-400',
  'audio/': 'from-amber-500/20 to-orange-500/20 text-amber-400',
  'application/zip': 'from-emerald-500/20 to-teal-500/20 text-emerald-400',
};

function getColor(mime: string) {
  for (const [prefix, color] of Object.entries(mimeColors)) {
    if (mime.startsWith(prefix)) return color;
  }
  return 'from-brand-500/20 to-indigo-500/20 text-brand-400';
}

export default function FileCard({ file, onDelete, index }: FileCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareHash, setShareHash] = useState(file.shareHash);
  const { addToast } = useToast();

  const Icon = getIcon(file.mimeType);
  const colorClass = getColor(file.mimeType);

  const handleShare = async () => {
    try {
      const res = await api.post<{ data: { shareHash: string } }>(`/files/${file.id}/share`);
      setShareHash(res.data.shareHash);
      setShareOpen(true);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
    setMenuOpen(false);
  };

  const handleUnshare = async () => {
    try {
      await api.del(`/files/${file.id}/share`);
      setShareHash(null);
      addToast('Share link removed', 'info');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${file.originalName}"?`)) return;
    try {
      await api.del(`/files/${file.id}`);
      addToast('File deleted', 'success');
      onDelete();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
    setMenuOpen(false);
  };

  const handleDownload = () => {
    downloadFile(`/files/${file.id}/download`, file.originalName);
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
          <p className="truncate text-sm font-medium text-white">{file.originalName}</p>
          <p className="text-[10px] text-surface-200 sm:text-xs">
            {formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()}
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
        fileName={file.originalName}
      />
    </>
  );
}

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
