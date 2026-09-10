export type FileKind = 'pdf' | 'image';

export type FileSource = 'documents' | 'gallery' | 'camera';

/** A file the user picked that has passed validation. */
export interface SelectedFile {
  uri: string;
  name: string;
  /** Size in bytes. */
  size: number;
  mimeType: string;
  /** Lower-case extension without the dot, e.g. `pdf`, `jpg`. */
  extension: string;
  kind: FileKind;
  source: FileSource;
  /** Pixel dimensions when the source reports them (gallery / camera). */
  width?: number;
  height?: number;
}

/** What a picker hands back before validation; everything may be missing. */
export interface FileCandidate {
  uri: string;
  name?: string | null;
  size?: number | null;
  mimeType?: string | null;
  source: FileSource;
  width?: number;
  height?: number;
}

export type FileValidationCode =
  | 'empty'
  | 'unknown-size'
  | 'too-large'
  | 'unsupported-type'
  | 'unsupported-extension'
  | 'type-mismatch';

export interface FileValidationIssue {
  code: FileValidationCode;
  /** Ready to show to the user. */
  message: string;
}

export type FileValidationResult =
  | { ok: true; file: SelectedFile }
  | { ok: false; issue: FileValidationIssue };
