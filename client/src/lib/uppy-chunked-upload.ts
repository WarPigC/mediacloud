/**
 * Custom chunked upload function for Uppy.
 * Instead of a class-based plugin (which has complex v4 type constraints),
 * we use Uppy's `addUploader()` API directly.
 *
 * Implements our 3-phase protocol:
 *   1. POST /api/files/upload/init         → get sessionId
 *   2. POST /api/files/upload/:id/chunk    → stream each 5MB chunk (sequential)
 *   3. POST /api/files/upload/:id/complete → stitch & finalize
 */
import type Uppy from '@uppy/core';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const ENDPOINT = '/api/files/upload';

export interface UploadResult {
  fileId: string;
  sanitizedName: string;
  shareHash: string;
  sizeBytes: number;
}

export type UploadCompleteCallback = (uppyFileId: string, result: UploadResult) => void;
export type UploadErrorCallback = (uppyFileId: string, error: Error) => void;
export type UploadProgressCallback = (uppyFileId: string, pct: number) => void;

interface ChunkedUploaderOpts {
  onComplete?: UploadCompleteCallback;
  onError?: UploadErrorCallback;
  onProgress?: UploadProgressCallback;
}

/**
 * Registers the chunked uploader on an Uppy instance.
 * Call this once after creating the Uppy instance.
 */
export function registerChunkedUploader(uppy: Uppy, opts: ChunkedUploaderOpts = {}) {
  const uploaderFn = async (fileIDs: string[]) => {
    for (const fileID of fileIDs) {
      await uploadSingleFile(uppy, fileID, opts);
    }
  };

  uppy.addUploader(uploaderFn);

  // Return a cleanup function
  return () => uppy.removeUploader(uploaderFn);
}

async function uploadSingleFile(uppy: Uppy, fileID: string, opts: ChunkedUploaderOpts) {
  const file = uppy.getFile(fileID);
  if (!file?.data) return;

  const blob = file.data as Blob;
  const totalSize = blob.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  try {
    // ── Phase 1: Init ──
    const initRes = await fetch(`${ENDPOINT}/init`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        totalSize,
        totalChunks,
        mimeType: file.type || 'application/octet-stream',
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json();
      throw new Error(err.error || 'Upload init failed');
    }

    const { data: { uploadSessionId } } = await initRes.json();

    // ── Phase 2: Send chunks sequentially ──
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = blob.slice(start, end);

      const formData = new FormData();
      formData.append('file', chunk, `chunk_${i}`);

      const chunkRes = await fetch(`${ENDPOINT}/${uploadSessionId}/chunk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Chunk-Index': String(i) },
        body: formData,
      });

      if (!chunkRes.ok) {
        const err = await chunkRes.json();
        throw new Error(err.error || `Chunk ${i} failed`);
      }

      const pct = Math.round((end / totalSize) * 100);
      opts.onProgress?.(fileID, pct);
    }

    // ── Phase 3: Complete ──
    const completeRes = await fetch(`${ENDPOINT}/${uploadSessionId}/complete`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!completeRes.ok) {
      const err = await completeRes.json();
      throw new Error(err.error || 'Upload completion failed');
    }

    const result = await completeRes.json();
    
    // Crucial: Tell Uppy the file is done so it doesn't try to re-upload it
    uppy.setFileState(fileID, { progress: { uploadComplete: Date.now(), uploadStarted: Date.now() } } as any);
    uppy.emit('upload-success', file, result);
    
    opts.onComplete?.(fileID, result.data);
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Upload failed');
    uppy.setFileState(fileID, { progress: { uploadComplete: 0, uploadStarted: Date.now() } } as any);
    uppy.emit('upload-error', file, error);
    opts.onError?.(fileID, error);
    throw error;
  }
}
