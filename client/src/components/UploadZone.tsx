import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileUp, CheckCircle2, AlertCircle } from 'lucide-react';
import Uppy from '@uppy/core';
import { registerChunkedUploader } from '../lib/uppy-chunked-upload';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatBytes } from '../lib/api';

interface UploadFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export default function UploadZone() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const { addToast } = useToast();
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uppyRef = useRef<Uppy | null>(null);

  useEffect(() => {
    const uppy = new Uppy({
      restrictions: { maxFileSize: 5 * 1024 * 1024 * 1024 },
      autoProceed: false,
    });

    const cleanup = registerChunkedUploader(uppy, {
      onComplete: (fileId: string, _result: any) => {
        setUploadFiles((prev) =>
          prev.map((f) => f.id === fileId ? { ...f, status: 'complete' as const, progress: 100 } : f)
        );
        const f = uppy.getFile(fileId);
        addToast(`"${f?.name}" uploaded`, 'success');

        // Remove the completed file from Uppy's internal state so it
        // cannot be re-uploaded when the user adds new files later.
        try { uppy.removeFile(fileId); } catch { /* already removed */ }
      },
      onError: (fileId: string, error: Error) => {
        setUploadFiles((prev) =>
          prev.map((f) => f.id === fileId ? { ...f, status: 'error' as const, error: error.message } : f)
        );
        const f = uppy.getFile(fileId);
        addToast(`"${f?.name}" failed: ${error.message}`, 'error');

        // Also remove errored files from Uppy so they don't block future uploads
        try { uppy.removeFile(fileId); } catch { /* already removed */ }
      },
      onProgress: (fileId: string, pct: number) => {
        setUploadFiles((prev) =>
          prev.map((f) => f.id === fileId ? { ...f, status: 'uploading' as const, progress: pct } : f)
        );
      },
    });

    uppyRef.current = uppy;
    return () => { cleanup(); uppy.cancelAll(); };
  }, [addToast]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const uppy = uppyRef.current;
    if (!uppy) return;

    const newFiles: UploadFile[] = [];
    for (const file of Array.from(fileList)) {
      try {
        uppy.addFile({ name: file.name, type: file.type, data: file, source: 'local' });
        const uppyFiles = uppy.getFiles();
        const added = uppyFiles[uppyFiles.length - 1];
        newFiles.push({
          id: added.id,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'pending',
        });
      } catch (err: any) {
        addToast(err.message || `Cannot add "${file.name}"`, 'error');
      }
    }
    setUploadFiles((prev) => [...prev, ...newFiles]);
  }, [addToast]);

  const startUpload = async () => {
    const uppy = uppyRef.current;
    if (!uppy || uploading) return;

    // Only upload files that Uppy still knows about (pending ones).
    // Already-completed files have been removed from Uppy's registry.
    const pendingUppyFiles = uppy.getFiles();
    if (pendingUppyFiles.length === 0) {
      addToast('No pending files to upload', 'error');
      return;
    }

    setUploading(true);
    try {
      await uppy.upload();
    } catch {
      // Individual errors handled by callbacks
    } finally {
      setUploading(false);
      refreshUser();

      // Auto-clear completed/errored entries from the UI queue after a short delay
      // so the user can briefly see the success checkmarks before they disappear.
      setTimeout(() => {
        setUploadFiles((prev) => prev.filter((f) => f.status !== 'complete' && f.status !== 'error'));
      }, 2000);
    }
  };

  const removeFile = (id: string) => {
    try { uppyRef.current?.removeFile(id); } catch { /* ignore */ }
    setUploadFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearCompleted = () => {
    const done = uploadFiles.filter((f) => f.status === 'complete' || f.status === 'error');
    done.forEach((f) => { try { uppyRef.current?.removeFile(f.id); } catch { /* ignore */ } });
    setUploadFiles((prev) => prev.filter((f) => f.status !== 'complete' && f.status !== 'error'));
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const pendingCount = uploadFiles.filter((f) => f.status === 'pending').length;
  const uploadingCount = uploadFiles.filter((f) => f.status === 'uploading').length;
  const completedCount = uploadFiles.filter((f) => f.status === 'complete').length;
  const errorCount = uploadFiles.filter((f) => f.status === 'error').length;

  const statusLabel = uploadingCount > 0
    ? `Uploading ${uploadingCount} file(s)...`
    : pendingCount > 0
      ? `${pendingCount} file(s) ready`
      : completedCount > 0 || errorCount > 0
        ? `${completedCount} completed${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        : '';

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Upload Files</h1>

      <motion.div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        animate={dragOver
          ? { scale: 1.01, borderColor: 'rgba(99,102,241,0.6)' }
          : { scale: 1, borderColor: 'rgba(255,255,255,0.08)' }}
        className="cursor-pointer rounded-2xl border-2 border-dashed bg-white/[0.02] p-8 text-center transition-colors hover:bg-white/[0.04] sm:p-12"
      >
        <motion.div
          animate={dragOver ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Upload className={`mx-auto h-12 w-12 ${dragOver ? 'text-brand-400' : 'text-white/20'}`} />
        </motion.div>
        <p className="mt-4 text-sm font-medium text-white">
          {dragOver ? 'Drop files here' : 'Drag & drop files, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-surface-200">Max 5 GB per file · Any file type</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { e.target.files && addFiles(e.target.files); e.target.value = ''; }}
        />
      </motion.div>

      <AnimatePresence>
        {uploadFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-surface-200">
                {statusLabel}
              </span>
              <div className="flex gap-2">
                {(completedCount > 0 || errorCount > 0) && (
                  <button onClick={clearCompleted} className="text-xs text-surface-200 hover:text-white">
                    Clear finished
                  </button>
                )}
                {pendingCount > 0 && (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={startUpload}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                  >
                    <FileUp className="h-4 w-4" />
                    {uploading ? 'Uploading...' : 'Upload All'}
                  </motion.button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {uploadFiles.map((f) => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="rounded-xl border border-white/5 bg-white/[0.03] p-3"
                >
                  <div className="flex items-center gap-3">
                    {f.status === 'complete' ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    ) : f.status === 'error' ? (
                      <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                    ) : (
                      <FileUp className="h-5 w-5 shrink-0 text-surface-200" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{f.name}</p>
                      <p className="text-xs text-surface-200">
                        {formatBytes(f.size)}
                        {f.status === 'error' && f.error && (
                          <span className="ml-1 text-red-400">· {f.error}</span>
                        )}
                      </p>
                    </div>
                    {f.status === 'pending' && (
                      <button onClick={() => removeFile(f.id)} className="text-surface-200 hover:text-red-400">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {f.status === 'uploading' && (
                      <span className="text-xs font-medium text-brand-400">{f.progress}%</span>
                    )}
                  </div>
                  {f.status === 'uploading' && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className="h-full rounded-full bg-brand-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${f.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
