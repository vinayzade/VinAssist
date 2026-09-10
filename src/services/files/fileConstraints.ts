import type { FileKind } from './types';

const MB = 1024 * 1024;

/** Upper size limits per kind, in bytes. Mirrors the backend upload limits. */
export const MAX_FILE_SIZE: Record<FileKind, number> = {
  pdf: 20 * MB,
  image: 10 * MB,
};

interface SupportedType {
  kind: FileKind;
  extensions: readonly string[];
}

/**
 * The MIME types the backend accepts, each with the extensions it may carry.
 * Anything not listed is rejected before it ever reaches the network.
 */
export const SUPPORTED_TYPES: Record<string, SupportedType> = {
  'application/pdf': { kind: 'pdf', extensions: ['pdf'] },
  'image/jpeg': { kind: 'image', extensions: ['jpg', 'jpeg'] },
  'image/png': { kind: 'image', extensions: ['png'] },
  'image/webp': { kind: 'image', extensions: ['webp'] },
  'image/heic': { kind: 'image', extensions: ['heic'] },
  'image/heif': { kind: 'image', extensions: ['heif'] },
};

/** Reverse index: extension -> canonical MIME type. */
export const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(SUPPORTED_TYPES).flatMap(([mime, { extensions }]) =>
    extensions.map(ext => [ext, mime]),
  ),
);

export function mimeTypesFor(kinds: readonly FileKind[]): string[] {
  return Object.entries(SUPPORTED_TYPES)
    .filter(([, t]) => kinds.includes(t.kind))
    .map(([mime]) => mime);
}

export function extensionsFor(kinds: readonly FileKind[]): string[] {
  return Object.values(SUPPORTED_TYPES)
    .filter(t => kinds.includes(t.kind))
    .flatMap(t => t.extensions);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < MB) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}
