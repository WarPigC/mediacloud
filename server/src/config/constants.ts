/** 5 GB in bytes */
export const STORAGE_QUOTA_BYTES = 5_368_709_120n;

/** 5 MB chunk size for uploads */
export const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/** Max characters in a sanitized filename */
export const MAX_FILENAME_LENGTH = 200;

/** Length of the public share hash */
export const SHARE_HASH_LENGTH = 8;

/** Hours after which an incomplete UploadSession is considered stale */
export const STALE_UPLOAD_HOURS = 24;

/** Name of the temp directory for chunk assembly */
export const TEMP_DIR_NAME = '_tmp';

/** Cookie names */
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
