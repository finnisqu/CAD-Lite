import { isJsonObject } from '../domain/types';
import { normalizePersistedEditorState, normalizeProjectState } from './normalize';
import { importV159, looksLikeV159ExportApp, looksLikeV159Snapshot } from './legacy/v159';
import type { CadLiteFile } from './schema';
import { CAD_LITE_SCHEMA_VERSION } from './schema';

export class UnsupportedCadLiteSchemaError extends Error {
  constructor(version: unknown) {
    super(`Unsupported CAD Lite schema version: ${String(version)}`);
    this.name = 'UnsupportedCadLiteSchemaError';
  }
}

export function isCanonicalCadLiteFile(value: unknown): value is CadLiteFile {
  return (
    isJsonObject(value) &&
    value.schemaVersion === CAD_LITE_SCHEMA_VERSION &&
    typeof value.appVersion === 'string' &&
    isJsonObject(value.project) &&
    isJsonObject(value.editor)
  );
}

export function normalizeCanonicalFile(value: CadLiteFile): CadLiteFile {
  const project = normalizeProjectState(value.project);

  return {
    schemaVersion: CAD_LITE_SCHEMA_VERSION,
    appVersion: value.appVersion,
    project,
    editor: normalizePersistedEditorState(value.editor, project),
  };
}

export function migrateCadLiteFile(value: unknown): CadLiteFile {
  if (isCanonicalCadLiteFile(value)) return normalizeCanonicalFile(value);

  if (isJsonObject(value) && 'schemaVersion' in value) {
    throw new UnsupportedCadLiteSchemaError(value.schemaVersion);
  }

  if (looksLikeV159ExportApp(value) || looksLikeV159Snapshot(value)) {
    return importV159(value);
  }

  throw new Error('Unrecognized CAD Lite project format.');
}

export function serializeCadLiteFile(file: CadLiteFile, pretty = false): string {
  const normalized = normalizeCanonicalFile(file);
  return JSON.stringify(normalized, null, pretty ? 2 : undefined);
}

export function deserializeCadLiteFile(json: string): CadLiteFile {
  const parsed: unknown = JSON.parse(json);
  return migrateCadLiteFile(parsed);
}
