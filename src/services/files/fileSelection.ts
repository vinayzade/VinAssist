import {
  errorCodes,
  isErrorWithCode,
  pick,
} from '@react-native-documents/picker';
import { launchImageLibrary } from 'react-native-image-picker';
import { mimeTypesFor } from './fileConstraints';
import { validateFile, type ValidateFileOptions } from './fileValidation';
import type {
  FileCandidate,
  FileKind,
  FileValidationIssue,
  SelectedFile,
} from './types';

export type FileSelectionCode =
  | FileValidationIssue['code']
  | 'permission'
  | 'unavailable'
  | 'unknown';

/**
 * Thrown when a selection fails for any reason other than the user
 * cancelling. `message` is user-facing; `code` lets callers branch.
 */
export class FileSelectionError extends Error {
  constructor(message: string, readonly code: FileSelectionCode) {
    super(message);
    this.name = 'FileSelectionError';
  }

  static fromIssue(issue: FileValidationIssue): FileSelectionError {
    return new FileSelectionError(issue.message, issue.code);
  }
}

export interface SelectDocumentOptions extends ValidateFileOptions {
  /** Defaults to PDF and images. */
  kinds?: readonly FileKind[];
}

/** Shared validation step: cancel -> null, invalid -> throw, valid -> file. */
function accept(
  candidate: FileCandidate,
  options: ValidateFileOptions,
): SelectedFile {
  const result = validateFile(candidate, options);
  if (!result.ok) {
    throw FileSelectionError.fromIssue(result.issue);
  }
  return result.file;
}

/**
 * Opens the system file browser filtered to the allowed kinds. Resolves with
 * a validated file, `null` if the user cancels, or throws
 * `FileSelectionError`. The file is copied into app storage (`mode: 'import'`)
 * so the URI stays readable after the picker closes; nothing is uploaded.
 */
export async function selectDocument(
  options: SelectDocumentOptions = {},
): Promise<SelectedFile | null> {
  const kinds = options.kinds ?? ['pdf', 'image'];

  let picked;
  try {
    [picked] = await pick({
      type: mimeTypesFor(kinds),
      allowMultiSelection: false,
      mode: 'import',
    });
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.OPERATION_CANCELED
    ) {
      return null;
    }
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.UNABLE_TO_OPEN_FILE_TYPE
    ) {
      throw new FileSelectionError(
        'This device cannot open that kind of file.',
        'unavailable',
      );
    }
    throw new FileSelectionError('Could not open the file browser.', 'unknown');
  }

  if (!picked) {
    return null;
  }
  if (picked.error) {
    throw new FileSelectionError(
      'Could not read the selected file.',
      'unknown',
    );
  }

  return accept(
    {
      uri: picked.uri,
      name: picked.name,
      size: picked.size,
      mimeType: picked.type,
      source: 'documents',
    },
    { ...options, kinds },
  );
}

/**
 * Opens the photo library (images only). Same contract as `selectDocument`.
 * Uses the platform photo picker, which needs no storage permission on
 * Android 13+ or iOS.
 */
export async function selectImageFromGallery(
  options: ValidateFileOptions = {},
): Promise<SelectedFile | null> {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
    quality: 0.9,
    includeBase64: false,
  });

  if (result.didCancel) {
    return null;
  }
  if (result.errorCode) {
    throw new FileSelectionError(
      result.errorCode === 'permission'
        ? 'Photo library access is turned off. Enable it in Settings.'
        : result.errorMessage ?? 'Could not open your photos.',
      result.errorCode === 'permission' ? 'permission' : 'unavailable',
    );
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) {
    return null;
  }

  return accept(
    {
      uri: asset.uri,
      name: asset.fileName,
      size: asset.fileSize,
      mimeType: asset.type,
      width: asset.width,
      height: asset.height,
      source: 'gallery',
    },
    { ...options, kinds: ['image'] },
  );
}

export const fileSelection = {
  selectDocument,
  selectImageFromGallery,
  validateFile,
};
