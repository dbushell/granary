/**
 * HTTP basic authentication credentials
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization}
 */
export type Credentials = {username: string; password: string};

/** Git LFS object */
export type LFSObject = {
  oid: string;
  size: number;
};

/** Git LFS object file */
export type LFSFile = LFSObject & {
  pathname: string;
  repo: string;
};

/** Batch response object action */
export type BatchResponseAction = {
  expires_in: number;
  header: Record<string, string>;
  href: string;
};

/** Batch response object error */
export type BatchResponseError = {
  code: number;
  message: string;
};

/** Batch response object with actions or error */
export type BatchResponseObject = LFSObject & {
  actions: Record<'download' | 'upload' | 'verify', BatchResponseAction>;
  authenticated: boolean;
  error?: BatchResponseError;
};

/**
 * Git LFS client batch API request
 * @see {@link https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md#requests}
 */
export type BatchRequest = {
  objects: Array<LFSObject>;
  operation: 'download' | 'upload' | 'verify';
  hash_algo?: string;
  ref?: {name: string};
  transfers?: Array<string>;
};

/**
 * Git LFS server batch API response
 * @see {@link https://github.com/git-lfs/git-lfs/blob/main/docs/api/basic-transfers.md}
 */
export type BatchResponse = {
  hash_algo: string;
  objects: Array<BatchResponseObject>;
  transfer: 'basic';
};

/** Runtime adapter to handle file system APIs */
export interface BatchAdapter {
  /** Returns `true` if object file exists and size matches */
  check(object: LFSFile): Promise<boolean>;

  /** Handle download request */
  download(object: LFSFile, request: Request): Promise<Response>;

  /** Handle upload request */
  upload(object: LFSFile, request: Request): Promise<Response>;
}

/** Server configuration options */
export interface BatchServerOptions {
  adapter: BatchAdapter;
  fsRoot: string;
  url: URL;
  origin?: URL;
  username?: string;
  password?: string;
}
