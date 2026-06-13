/** File metadata returned by the API */
export interface FileMetadata {
  id: string;
  originalName: string;
  sanitizedName: string;
  mimeType: string;
  sizeBytes: number;
  shareHash: string | null;
  isPublic: boolean;
  createdAt: string;
}

/** POST /api/files/upload/init request body */
export interface UploadInitRequest {
  filename: string;
  totalSize: number;
  totalChunks: number;
  mimeType: string;
}

/** POST /api/files/upload/init response */
export interface UploadInitResponse {
  uploadSessionId: string;
}

/** Chunk upload progress response */
export interface ChunkUploadResponse {
  receivedChunks: number;
  totalChunks: number;
}

/** Public share page metadata */
export interface SharePageMetadata {
  originalName: string;
  sizeBytes: number;
  mimeType: string;
}
