import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, X, Link2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareHash: string | null;
  fileName: string;
}

export default function ShareModal({ isOpen, onClose, shareHash, fileName }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  if (!shareHash) return null;

  const shareUrl = `${window.location.origin}/d/${shareHash}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      addToast('Link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Failed to copy link', 'error');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-surface-800 p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-brand-400" />
                <h3 className="text-lg font-semibold text-white">Share Link</h3>
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-surface-200 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-sm text-surface-200">
              Anyone with this link can download <strong className="text-white">{fileName}</strong>
            </p>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent px-2 text-sm text-white outline-none"
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
